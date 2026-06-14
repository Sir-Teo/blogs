---
layout: post
title: "Arrows That Survive Conditioning"
description: "Granger causality is a statement about incremental forecasting. It becomes a causal clue only after the right past variables, lag order, and measurement process survive scrutiny."
date: 2026-06-14 12:00:00 -0400
categories: statistics
tags: [granger-causality, time-series, causal-discovery, vector-autoregression, confounding, forecasting, statistics]
excerpt: "If X predicts Y tomorrow, X may be a cause. It may also be yesterday's thermometer for an earlier variable you forgot to measure."
---

There is a sentence that sounds causal but is only half-causal:

```text
X helps predict Y.
```

Sometimes that is exactly the evidence you want. A pressure wave reaches one
sensor before another. An order-flow imbalance precedes a price move. A neural
population changes before a movement. A load spike in one service precedes a
retry storm in another.

But prediction has an escape hatch. A variable can predict the future without
being the thing that makes the future happen. It can be a witness, a delayed
thermometer, a proxy for an earlier shock.

That is the tension inside Granger causality.

Granger's original idea was deliberately operational: if the past of one series
contains information that improves forecasts of another series, after accounting
for the target's own past, then the first series "causes" the second in the
Granger sense.[^granger] In a linear vector autoregression, that often becomes a
nested regression test:

$$
Y_t
=
\alpha
+ \sum_{\ell=1}^{p} a_\ell Y_{t-\ell}
+ \epsilon_t
$$

versus

$$
Y_t
=
\alpha
+ \sum_{\ell=1}^{p} a_\ell Y_{t-\ell}
+ \sum_{\ell=1}^{p} b_\ell X_{t-\ell}
+ \epsilon_t.
$$

If the unrestricted model forecasts better, the past of $$X$$ carries
incremental information about $$Y$$.

That is useful. It is not yet an intervention.

Pearl's causal language is stricter: causal claims are about what would happen
under interventions, and they require assumptions about the data-generating
process, not just observed associations.[^pearl] Granger causality can be a
good clue to such structure when the temporal ordering, measurement process, and
conditioning set are right. It can also be fooled by the oldest enemy in causal
inference: a common cause.

## The Shadow Problem

Imagine a hidden driver $$H$$.

It moves $$X$$ quickly:

$$
X_t = 0.42 X_{t-1} + cH_{t-1} + \eta_t.
$$

It moves $$Y$$ a little later:

$$
Y_t = 0.38 Y_{t-1} + cH_{t-2} + \epsilon_t.
$$

There is no direct $$X \rightarrow Y$$ path in this story. Still, $$X_{t-1}$$
will often help predict $$Y_t$$ because $$X_{t-1}$$ is a noisy report about
$$H_{t-2}$$.

The clock is real. The arrow is not.

That is why conditional Granger tests matter. The pairwise question asks:

```text
does X help predict Y after Y's own past?
```

The conditional question asks:

```text
does X still help predict Y after Y's past and H's past?
```

If the signal disappears after conditioning on the earlier driver, the pairwise
arrow was a shadow.

## A Small Granger Lab

The lab below simulates three stationary time series:

- $$H$$ is an autoregressive common driver.
- $$X$$ reacts to $$H$$ after one time step.
- $$Y$$ reacts to $$H$$ after two time steps.

By default, the true direct coefficient from $$X$$ to $$Y$$ is exactly zero.
The pairwise Granger test still finds a very strong $$X \rightarrow Y$$ signal.
The conditional test, which is allowed to see $$H$$, mostly removes it.

<style>
  .granger-lab {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    margin: 1.5rem 0;
    padding: 1rem;
    background: #ffffff;
  }

  .granger-lab__controls {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .granger-lab__controls label {
    color: #172026;
    display: grid;
    font-size: 0.85rem;
    font-weight: 700;
    gap: 0.35rem;
  }

  .granger-lab__controls output {
    color: #0f766e;
    font-variant-numeric: tabular-nums;
  }

  .granger-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .granger-lab__metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0.2rem 0 0.9rem;
  }

  .granger-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    padding: 0.62rem 0.7rem;
  }

  .granger-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .granger-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }

  .granger-lab canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    display: block;
    width: 100%;
  }

  .granger-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }

  .granger-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .granger-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .granger-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 900px) {
    .granger-lab__controls,
    .granger-lab__metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .granger-lab {
      margin-left: calc(50% - 50vw + 1rem);
      margin-right: calc(50% - 50vw + 1rem);
    }

    .granger-lab__controls,
    .granger-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .granger-lab__controls,
    .granger-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="granger-lab" data-granger-shadow-lab>
  <div class="granger-lab__controls">
    <label>
      Direct X to Y <output data-value="direct">0.00</output>
      <input type="range" min="0" max="90" step="5" value="0" data-param="direct">
    </label>
    <label>
      Common driver <output data-value="common">0.69</output>
      <input type="range" min="0" max="100" step="5" value="75" data-param="common">
    </label>
    <label>
      VAR lag order <output data-value="lagOrder">2</output>
      <input type="range" min="1" max="4" step="1" value="2" data-param="lagOrder">
    </label>
    <label>
      Series length <output data-value="length">420</output>
      <input type="range" min="180" max="1200" step="20" value="420" data-param="length">
    </label>
    <label>
      Innovation noise <output data-value="noise">55%</output>
      <input type="range" min="20" max="140" step="5" value="55" data-param="noise">
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input type="range" min="1" max="999" step="1" value="23" data-param="seed">
    </label>
  </div>
  <div class="granger-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Granger causality lab showing pairwise and conditional lagged prediction under a hidden common driver"></canvas>
  <div class="granger-lab__legend">
    <span><i style="background:#7c3aed"></i> H common driver</span>
    <span><i style="background:#2563eb"></i> X witness series</span>
    <span><i style="background:#0f766e"></i> Y target series</span>
    <span><i style="background:#be123c"></i> Pairwise X to Y</span>
    <span><i style="background:#d97706"></i> Reverse Y to X</span>
  </div>
  <p class="granger-lab__note">
    Deterministic synthetic experiment. The tests are ordinary nested linear
    regressions: restricted and unrestricted VAR-style models are compared by
    an F statistic. "Conditioned" means the model includes lagged H as an
    observed control.
  </p>
</div>

<script defer src="{{ '/assets/js/granger-shadow-lab.js?v=20260614a' | relative_url }}"></script>

With the defaults, the lab says:

```text
true X -> Y coefficient:      0.00
pairwise X -> Y p-value:      <0.001
conditioned X -> Y p-value:   0.275
pairwise incremental R2:      0.1102
conditioned incremental R2:   0.0014
```

So the pairwise test is not "wrong" in its own language. $$X$$ really does
improve forecasts of $$Y$$ when the forecaster is only allowed to see $$Y$$'s
past. The mistake would be to read that as an intervention claim. Once the
forecaster also sees the past of $$H$$, the extra information in $$X$$ mostly
vanishes.

Now raise **Direct X to Y**. At a direct coefficient around `0.47`, the
conditional test becomes highly significant in the same synthetic world. That is
the point of conditioning: not to be cynical about every arrow, but to ask
which arrows still carry information after the plausible earlier causes are in
the room.

## Pairwise Granger Is a Screening Tool

The pairwise test is tempting because it is clean. For every ordered pair of
series, fit two regressions and ask whether the lags of one improve forecasts of
the other. A heatmap of p-values appears. A directed network appears. The paper
or dashboard now has arrows.

But the pairwise test is answering a small question:

```text
does this series contain predictive information not already in the target's own past?
```

It is not answering:

```text
would intervening on this series change the target?
```

Those questions line up only under extra assumptions. You need to have measured
enough of the relevant past. You need the lag order to cover the mechanism. You
need a model class that can represent the dependence. You need the measurement
process not to manufacture delays or erase them.

Runge and coauthors describe this larger time-series causal-discovery problem
well: autocorrelation, time lags, common drivers, contemporaneous links,
nonlinear dependence, and latent variables all interact.[^runge] Methods such
as PCMCI are built around conditional independence logic rather than pairwise
screening alone, precisely because autocorrelated systems can create many
plausible-looking shadows.

The lab is linear and friendly. Real systems are not obligated to be.

## Lag Order Is Part of the Claim

The slider labeled **VAR lag order** is easy to underestimate.

If the true mechanism takes two steps and the model only includes one lag, the
regression is asking the wrong question. It may miss the real path. It may
attribute the path to a nearby proxy. It may leave autocorrelated residuals that
make p-values look sharper than they are.

This is one reason applied Granger analysis is full of mundane modeling chores:
stationarity checks, lag selection, residual diagnostics, robustness across
orders, transformations, and domain-specific timing arguments. Luetkepohl's VAR
treatment is useful precisely because it keeps Granger causality inside a full
time-series modeling workflow rather than presenting it as a one-button
arrow machine.[^lutkepohl]

There is also a measurement problem. Filtering, downsampling, aggregation, and
observational noise can change the apparent dynamic structure. Barnett and Seth
make this concrete for Granger causality in state-space models: pure
autoregressive estimation can struggle when the observed process has a moving
average component, which is exactly what filtering and measurement noise can
induce.[^barnett-seth]

If your data are sampled every minute, but the mechanism operates in seconds,
the lag you estimate is partly a property of the logging system.

## What Granger Evidence Is Good For

I do not read the lab as an argument against Granger causality. I read it as an
argument for using the name carefully.

Granger evidence is good when the scientific or engineering question is about
forecasting:

```text
does this signal help predict that signal?
```

That is already a serious question. Forecasting can drive alerting, control,
execution, triage, diagnosis, and compression. In many systems, a predictive
witness is valuable even if it is not the intervention point.

Granger evidence is also useful as a causal clue:

```text
if this variable is upstream, does its past contain incremental information?
```

A real causal path should often leave a predictive trace. If it does not, either
the effect is weak, the timing is wrong, the measurement is poor, or the model
is misspecified. That negative evidence matters.

The danger is the unearned promotion:

```text
predictive witness -> causal lever
```

That promotion needs a conditioning argument, a timing argument, and usually
some domain knowledge.

## The Checklist I Actually Use

When I see a Granger-style arrow, I want to know:

1. What variables were allowed in the conditioning set?
2. Is the lag order long enough for the mechanism and short enough for the data?
3. Are residuals still autocorrelated?
4. Could filtering, aggregation, or latency have created the apparent order?
5. Is the claim about forecasting, intervention, or causal discovery?
6. Does the arrow survive plausible alternative specifications?

The lab's default failure is simple because the point is simple. $$X$$ predicts
$$Y$$ because $$X$$ is carrying old information about $$H$$. In real data, the
hidden driver will not politely sit in a purple line on the chart.

That is why the arrow has to survive conditioning.

---

[^granger]: C. W. J. Granger, ["Investigating Causal Relations by Econometric Models and Cross-Spectral Methods"](https://www.jstor.org/stable/1912791), *Econometrica*, 37(3):424-438, 1969.

[^pearl]: Judea Pearl, ["Causal Inference in Statistics: An Overview"](https://projecteuclid.org/journals/statistics-surveys/volume-3/issue-none/Causal-inference-in-statistics-An-overview/10.1214/09-SS057.full), *Statistics Surveys*, 3:96-146, 2009.

[^runge]: Jakob Runge et al., ["Inferring Causation from Time Series in Earth System Sciences"](https://www.nature.com/articles/s41467-019-10105-3), *Nature Communications*, 10, 2553, 2019.

[^lutkepohl]: Helmut Luetkepohl, [*New Introduction to Multiple Time Series Analysis*](https://ideas.repec.org/b/spr/sprbok/978-3-540-27752-1.html), Springer, 2005.

[^barnett-seth]: Lionel Barnett and Anil K. Seth, ["Granger Causality for State-Space Models"](https://arxiv.org/abs/1501.06502), *Physical Review E*, 91, 040101, 2015.
