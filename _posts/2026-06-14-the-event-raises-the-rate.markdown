---
layout: post
title: "The Event Raises the Rate"
description: "A Hawkes process is a point-process model where events do not merely arrive; they temporarily make more events likely. The average rate can look normal while the clock remembers."
date: 2026-06-14 11:27:00 -0400
categories: quantitative-finance
tags: [hawkes-processes, point-processes, market-microstructure, stochastic-processes, clustering, statistics]
excerpt: "Two event streams can have the same average rate and very different risk. A Hawkes process puts the missing state in the intensity."
---

The average rate is a calm statistic.

It says: 180 trades per minute, 40 incidents per day, 3 failures per rack-hour,
12 alerts per shift.

Then the pager starts behaving like a drum.

The problem is not only that the rate increased. The problem is that one event
changed the odds of the next event. The clock acquired memory.

That is the Hawkes-process move:

```text
an event is not only an observation
it is also a temporary input to the future intensity
```

## The Diagnostic Mistake

Suppose two event streams have the same long-run average rate.

One is close to Poisson: event arrivals are conditionally independent given a
constant rate. The other arrives in bursts: one event kicks the short-term rate
up, then that extra rate decays.

If the dashboard reports only events per minute, these streams can look
interchangeable. They are not interchangeable. Capacity planning, alert fatigue,
market-impact estimates, and contagion risk all care about clustering.

A point process writes this in its conditional intensity:

$$
\lambda(t \mid \mathcal{H}_t),
$$

the instantaneous event rate given the history so far. A homogeneous Poisson
process has no history in the rate:

$$
\lambda(t \mid \mathcal{H}_t) = \mu.
$$

An exponential Hawkes process adds memory:

$$
\lambda(t) =
\mu + \sum_{t_i < t} \alpha e^{-\beta(t-t_i)}.
$$

Each event adds a jump of size $$\alpha$$. The jump decays at rate $$\beta$$.
The ratio

$$
n = \frac{\alpha}{\beta}
$$

is the branching ratio: the expected number of direct offspring events caused by
one event in the cluster representation. In the linear Hawkes model, a stable
stationary process needs $$n < 1$$. As $$n$$ approaches one, the process gets
near critical; clusters can become large and slow to die.

Hawkes' 1971 papers introduced self-exciting and mutually exciting point
processes in exactly this spirit: events can make future events more likely, and
multiple event streams can excite each other.[^hawkes]

## The Lab: Same Mean, Different Clock

The lab below simulates a univariate exponential Hawkes process using Ogata's
thinning method.[^ogata] It compares the path to a Poisson process with the same
stationary mean rate:

$$
\bar\lambda = \frac{\mu}{1-n}.
$$

The Hawkes path is initialized at that stationary mean intensity, so the default
contrast is not a cold-start trick. Both processes are deterministic for a given
seed.

<style>
  .hawkes-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .hawkes-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(164px, 1fr));
  }

  .hawkes-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hawkes-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .hawkes-lab input[type="range"] {
    width: 100%;
  }

  .hawkes-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .hawkes-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }

  .hawkes-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 720;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .hawkes-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.15rem;
  }

  .hawkes-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    max-width: 100%;
    width: 100%;
  }

  .hawkes-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    gap: 0.7rem 1rem;
    margin-top: 0.75rem;
  }

  .hawkes-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .hawkes-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .hawkes-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }
</style>

<div class="hawkes-lab" data-hawkes-burst-lab>
  <div class="hawkes-lab__controls">
    <label>
      Baseline rate <output data-value="baseline">0.80/t</output>
      <input type="range" min="20" max="260" step="5" value="80" data-param="baseline">
    </label>
    <label>
      Branching ratio <output data-value="branching">65%</output>
      <input type="range" min="0" max="95" step="5" value="65" data-param="branching">
    </label>
    <label>
      Decay beta <output data-value="decay">1.80</output>
      <input type="range" min="40" max="600" step="10" value="180" data-param="decay">
    </label>
    <label>
      Horizon <output data-value="horizon">80</output>
      <input type="range" min="30" max="160" step="5" value="80" data-param="horizon">
    </label>
    <label>
      Seed <output data-value="seed">3</output>
      <input type="range" min="1" max="999" step="1" value="3" data-param="seed">
    </label>
  </div>
  <div class="hawkes-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Hawkes process lab comparing self-exciting event bursts with a Poisson process of the same mean rate"></canvas>
  <div class="hawkes-lab__legend">
    <span><i style="background:#be123c"></i> Hawkes events</span>
    <span><i style="background:#2563eb"></i> Same-mean Poisson</span>
    <span><i style="background:#d97706"></i> Conditional intensity</span>
    <span><i style="background:#7c3aed"></i> Mostly endogenous event</span>
  </div>
  <p class="hawkes-lab__note">
    Toy univariate exponential Hawkes process. The comparison Poisson process
    uses the same stationary mean rate. The time-rescale diagnostic uses the
    Hawkes model that generated the path, not an estimated model.
  </p>
</div>

<script defer src="{{ '/assets/js/hawkes-burst-lab.js?v=20260614a' | relative_url }}"></script>

In the default deterministic run, the counts are deliberately close:

```text
Hawkes events:   177
Poisson events:  173
```

But the clustering is not close:

```text
Hawkes Fano factor:   5.46
Poisson Fano factor:  0.63
Hawkes gap CV:        1.51
Poisson gap CV:       1.05
```

The Fano factor is variance divided by mean for equal-width bin counts. A
Poisson process has Fano factor one in the ideal model. Finite samples wiggle,
but a Fano factor around five is not a wiggle. It is the signature of bursts.

Move **Branching ratio** down to `0%`. The Hawkes process collapses toward a
Poisson process with rate $$\mu$$. Move it toward `90%` or `95%`. The average
rate rises as $$\mu/(1-n)$$, but the more important visual change is that event
clusters dominate the time line.

Move **Decay beta**. Higher decay means excitation burns off quickly: sharper,
shorter bursts. Lower decay means memory persists. Two models can have the same
branching ratio but different burst shapes because $$\alpha=n\beta$$ and
$$\beta$$ decide how concentrated the offspring risk is in time.

## Why Finance Likes This Model

High-frequency finance is made of event times: trades, quote changes, order
submissions, cancellations, price moves, and cross-asset responses. The natural
question is rarely "how many per minute?" alone. It is:

```text
did this event raise the short-term odds of another event?
did events in stream A raise the odds in stream B?
how fast did that effect decay?
```

Bacry, Mastromatteo, and Muzy review how Hawkes processes entered market
microstructure: volatility at transaction time scales, market stability,
contagion, systemic risk, execution, and order-book dynamics.[^bacry] The
appeal is straightforward. A multivariate Hawkes model turns a cloud of event
timestamps into a matrix of excitation kernels.

That does not make the model safe by default.

Self-excitation can mean several things:

1. genuine contagion;
2. order splitting by one large participant;
3. common reaction to an unobserved news shock;
4. market-making inventory feedback;
5. timestamping or batching artifacts;
6. an omitted covariate that changes the baseline rate.

A Hawkes fit names dependence in event time. It does not prove the causal story.

## The Time-Change Sanity Check

For a correctly specified point-process model, the integrated intensity between
successive events,

$$
z_i =
\int_{t_{i-1}}^{t_i} \lambda(s)\,ds,
$$

should behave like independent exponential random variables with mean one. This
is the time-rescaling theorem used in point-process diagnostics. Ogata's work on
earthquake occurrence models made residual analysis a central practical tool:
transform the fitted process, then check whether the residual process looks
Poisson.[^ogata1988]

The lab's ledger reports a simple Kolmogorov-Smirnov distance for those
time-rescaled gaps under the **true generating model**. It is not an estimator
benchmark. It is there to emphasize that a point-process model is testable on
the clock, not only on the total count.

If you fit a Hawkes model to real data, the residual check is where many pretty
stories get less pretty.

## The Branching Ratio Is Not a Vibe

The branching ratio is often the headline because it has a seductive
interpretation: the expected fraction of events that are endogenous is roughly
$$n$$ in the stationary linear Hawkes model. If $$n=0.65$$, one is tempted to
say "65% of events are caused by previous events."

Careful.

That statement lives inside the model. If the baseline is misspecified, if there
are intraday seasonality effects, if one latent news process is omitted, or if
several agents react to the same external signal, the fitted branching ratio can
absorb structure that is not literal contagion.

This is why I like the lab's more boring language:

```text
branching ratio controls how much event risk is recycled into the future
```

That is a model statement. It is useful without pretending to be causal by
itself.

## What I Would Log

For any production event stream where bursts matter, I would not stop at rate
charts. I would log and monitor:

1. event timestamps at the finest trustworthy resolution;
2. explicit marks such as event type, venue, host, route, side, size, or actor;
3. calendar-time seasonality so baseline movement does not masquerade as
   self-excitation;
4. bin-count Fano factors at several window sizes;
5. fitted excitation kernels with confidence intervals;
6. time-rescaled residual diagnostics;
7. out-of-sample burst prediction, not only in-sample likelihood.

Hawkes processes are useful because they move the hidden state into the open.
The intensity is not a constant. It is a live object that history keeps pushing.

The average rate answers:

```text
how busy was the clock?
```

The Hawkes question is sharper:

```text
what did the last event do to the next minute?
```

[^hawkes]: Alan G. Hawkes, ["Spectra of Some Self-Exciting and Mutually Exciting Point Processes"](https://www.dcscience.net/Hawkes-Biometrika-1971.pdf), *Biometrika*, 1971. See also ["Point Spectra of Some Mutually Exciting Point Processes"](https://rss.onlinelibrary.wiley.com/doi/10.1111/j.2517-6161.1971.tb01530.x), *Journal of the Royal Statistical Society: Series B*, 1971.

[^ogata]: Yosihiko Ogata, ["On Lewis' Simulation Method for Point Processes"](https://bemlar.ism.ac.jp/zhuang/Refs/Refs/ogata1981ieee.pdf), *IEEE Transactions on Information Theory*, 1981.

[^bacry]: Emmanuel Bacry, Iacopo Mastromatteo, and Jean-Francois Muzy, ["Hawkes Processes in Finance"](https://arxiv.org/abs/1502.04592), *Market Microstructure and Liquidity*, 2015.

[^ogata1988]: Yosihiko Ogata, ["Statistical Models for Earthquake Occurrences and Residual Analysis for Point Processes"](https://www.jstor.org/stable/2288914), *Journal of the American Statistical Association*, 1988.
