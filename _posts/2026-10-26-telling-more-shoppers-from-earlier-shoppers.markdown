---
layout: post
neutral: true
title: "Building a demand model from an unfinished curve"
description: >-
  A busy start can mean more searches overall, or the same searches arriving
  earlier. Build a forecast, test it on synthetic histories, and check what remains.
date: 2026-10-26 20:00:00 -0400
excerpt: >-
  Searches for a flight are running ahead of the usual pace. Raising the whole
  forecast seems reasonable—until the lead starts to fade. A visual experiment
  in separating how much interest arrives from when it arrives.
styles:
  - /assets/css/two-step.css?v=20261027.2
scripts:
  - /assets/js/volume-timing-fit.js?v=20261027.2
  - /assets/js/two-step-core.js?v=20261027.2
  - /assets/js/two-step.js?v=20261027.2
---

In one of my research projects at ATPCO, I explored a question: when ticket searches for a flight arrive faster than usual, how many are still to come before takeoff?

Each search counts, including repeats by the same person. The early lead might be extra interest, or simply earlier planning. We'll use a made-up search history so we can check our forecast against a known ending.

## The searches so far

We draw a usual search pattern and call it the **baseline**. For a real flight, we'd estimate it from similar flights that have already taken off. Each bar covers a stretch of time before takeoff.

Then we change the pattern and <a class="act" href="#ts-input" data-view="today">hide the searches after today</a>. The beginning looks busy; the ending is still unknown.

<figure class="fig wide ts" id="ts-input" data-stage="inputs" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>Move Now to reveal more of the same history; the forecasts below update together. Dots are recorded searches, gray bars the baseline. Future intervals stay hidden. Both axes use percentages of the baseline total and full time window.</figcaption>
</figure>

## Scaling the rest

Add the dot values above to get the count seen so far, $$N$$, and the gray bar values to get the expected count, $$N_0$$. Our first forecast scales the baseline by their ratio:

$$
\hat s=\frac{N}{N_0}.
$$

The amber curve below is the gray baseline multiplied by $$\hat s$$, including the part we haven't seen.

<figure class="fig wide ts" id="ts-naive" data-stage="flat" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>The dotted gaps show too few searches early and too many later. Dots from unfinished intervals are scaled up for comparison with a complete interval. The amber curve then overpredicts what remains.</figcaption>
</figure>

The total fits, but the lead is fading across intervals. Some of the activity may have moved earlier. A multiplier can't express that.

## Moving searches earlier

Now draw a **running total**: each point adds up all searches received by that time. Its endpoint shows **volume**, the total number of searches. The path to it shows **timing**.

Let $$b_c$$ be the baseline share in interval $$c$$, and $$t_c$$ its midpoint measured from the start. A timing control, $$\theta$$, changes each share to

$$
p_c(\theta)=\frac{b_c\,e^{\theta t_c}}{\sum_j b_j\,e^{\theta t_j}}.
$$

Negative $$\theta$$ favors earlier intervals. Dividing by the sum keeps the shares adding to one, so changing timing alone preserves the total.

With <a class="act" href="#ts-knobs" data-preset="earlier">earlier searches alone</a>, the curve gets ahead but reaches the same endpoint. Then allow <a class="act" href="#ts-knobs" data-preset="both">earlier searches and a larger total</a>. Both effects can be present in the same busy start.

<figure class="fig wide ts ts-hero" id="ts-knobs" data-stage="design" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>The endpoint M is the full total; the dot at Now is what has arrived so far. Moving searches earlier raises the dot while M stays fixed. Increasing the total raises both.</figcaption>
</figure>

The fraction already arrived, $$F$$, comes straight from those two heights:

$$
F=\frac{\text{height at Now}}{M}.
$$

The live $$F$$ readout changes with timing. Raising the total alone leaves this fraction unchanged.

## Fitting the visible part

To choose a timing curve, compare shares of searches seen so far. Write the recorded count in interval $$c$$ as $$Y_c$$, so each black dot below is $$Y_c/N$$.

For the blue bars, multiply each full-interval share $$p_c$$ by the fraction of that interval already elapsed, $$I_c$$, then divide by the arrived fraction $$F$$. Call this visible share $$q_c$$. We adjust $$\theta$$ until the fitted and recorded average arrival times agree:

$$
\begin{aligned}
q_c(\theta)&=\frac{I_c\,p_c(\theta)}{F(\theta)},\\[0.6em]
\sum_c q_c(\hat\theta)\,t_c&=\frac{\sum_c Y_c\,t_c}{N}.
\end{aligned}
$$

The two sides of the second line are the **Fitted** and **Recorded** averages. The markers below show when they agree.

<figure class="fig wide ts" id="ts-fit" data-stage="timing" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>Blue bars show q; black dots show Y/N. The two markers underneath summarize their average arrival times. Only observed intervals enter the fit.</figcaption>
</figure>

## Forecasting the rest

The fitted share $$F$$ is shown below. If $$N$$ searches represent that fraction of the full total, the estimated endpoint is $$N/F$$. Subtract the searches already recorded to get the rest:

$$
\begin{aligned}
\widehat M&=\frac{N}{F},\\[0.4em]
\widehat R&=\widehat M-N.
\end{aligned}
$$

<figure class="fig wide ts" id="ts-future" data-stage="forecast" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>The blue R bar is the remaining count from the formula. Reveal the curve used to generate the hidden searches to check it. Here, allowing earlier searches brings the forecast closer to what remains.</figcaption>
</figure>

The original multiplier was waiting for searches that had, in effect, already happened.

## Too early to tell

Move today farther back. With only one observed interval, changing the total or changing the timing can explain the same count. There isn't enough of a pattern to separate them.

<figure class="fig wide ts" id="ts-information" data-stage="identification" data-src="{{ '/assets/data/two-step/experiment.json?v=20261027.2' | relative_url }}">
<figcaption>The blue band shows different totals and timings that explain the same snapshot. Move the clock forward and the possibilities narrow. The cross is the setting used to generate the searches.</figcaption>
</figure>

We keep the baseline forecast when the two effects can't be separated. A brief burst of searches is another test for this smooth shape. Predicting ticket sales would require a further check: how often those searches turn into purchases.
