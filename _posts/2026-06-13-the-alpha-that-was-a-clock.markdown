---
layout: post
title: "When Alpha Was Mostly a Clock"
description: "At high frequency, a lead-lag signal can be a real market effect, a data-engineering artifact, or both. The Epps effect is the warning label."
date: 2026-06-13 06:18:00 -0400
categories: quantitative-finance
tags: [market-microstructure, epps-effect, covariance-estimation, lead-lag, high-frequency-data, quantitative-finance]
excerpt: "A strategy says one asset predicts another by a few seconds. Before believing the alpha, audit the clocks: asynchronous ticks, previous-tick interpolation, microstructure noise, and lead-lag structure can manufacture a signal."
---

The trade looks clean.

Asset A moves. A few seconds later, asset B moves. The lagged correlation is
positive, the backtest is fast, and the story writes itself: A contains
information, B is slow, buy B when A jumps.

Maybe.

But in high-frequency data, "A leads B" can mean at least four different
things:

1. information reaches one market first;
2. one asset trades more often than the other;
3. the data vendor stamped two feeds with different clocks;
4. the research code synchronized asynchronous observations in a way that
   created the lag it later discovered.

The uncomfortable version is this:

```text
some alphas are clocks with a Sharpe ratio
```

This post is about the Epps effect, nonsynchronous trading, and the strange
way a correlation can vanish at one sampling frequency and reappear at another.
It is also about a research habit: before calling a high-frequency relation an
economic signal, make a ledger of the clocks that produced it.

## The Old Warning

In 1979, Thomas Epps studied comovements in stock prices over very short
intervals and reported the phenomenon now bearing his name: empirical
correlations between returns are smaller at very fine horizons and rise as
returns are aggregated over longer intervals.[^epps] This is exactly backward
from the naive mental model in which "more data" always means "better
measurement."

At one-second bars, two related stocks may look weakly correlated. At
five-minute bars, they look strongly correlated. The economic relationship did not
necessarily change. The measuring device did.

The core problem is that traded prices are not observed on a shared grid. One
asset may trade hundreds of times per minute. Another may trade ten times per
minute. Quotes and trades arrive with different latencies, batching rules,
filters, venues, and timestamp conventions. A return computed on a regular grid
is therefore not the return of a continuously observed process. It is the
return of the last observed price before each grid time.

For asset $$X$$ observed at times $$T_i$$ and asset $$Y$$ observed at times
$$S_j$$, previous-tick synchronization constructs

$$
\tau_X(t) = \max\{T_i : T_i \leq t\},
\qquad
\tau_Y(t) = \max\{S_j : S_j \leq t\},
$$

then uses

$$
\Delta_k X
= X_{\tau_X(k\Delta)} - X_{\tau_X((k-1)\Delta)}
$$

and similarly for $$Y$$. This looks innocent. It is not. The two returns may
cover different physical intervals, and those intervals may overlap only
partly, or not at all.

Lo and MacKinlay formalized related problems in a stochastic model of
nonsynchronous asset prices, showing how random censoring and infrequent
trading affect variances, autocorrelations, and cross-autocorrelations.[^lo]
That matters because a lead-lag backtest is usually built from exactly those
objects.

## A Toy Market With Bad Clocks

The lab below simulates two latent correlated log-price paths. The latent paths
share a common shock, but the observed prices arrive on separate Poisson-like
trading clocks. Asset A is liquid. Asset B is less liquid. You can add a small
physical lag in B, then add microstructure noise.

The simulator compares four things:

1. the latent correlation on the selected bar size;
2. the previous-tick synchronized correlation;
3. a Hayashi-Yoshida overlap covariance estimate;
4. the lead-lag curve produced by shifting one observed return series against
   the other.

<div class="epps-lab" data-epps-lab>
  <div class="epps-lab__controls">
    <label>
      Latent correlation: <output data-value="correlation">75%</output>
      <input type="range" min="0" max="95" step="5" value="75" data-param="correlation">
    </label>
    <label>
      Fast ticks: <output data-value="fastRate">80/min</output>
      <input type="range" min="5" max="120" step="5" value="80" data-param="fastRate">
    </label>
    <label>
      Slow ticks: <output data-value="slowRate">15/min</output>
      <input type="range" min="2" max="80" step="1" value="15" data-param="slowRate">
    </label>
    <label>
      Physical lag: <output data-value="lagSeconds">2s</output>
      <input type="range" min="0" max="10" step="1" value="2" data-param="lagSeconds">
    </label>
    <label>
      Noise: <output data-value="noiseBps">1.0 bps</output>
      <input type="range" min="0" max="5" step="0.25" value="1" data-param="noiseBps">
    </label>
    <label>
      Bar size: <output data-value="barSeconds">10s</output>
      <input type="range" min="1" max="60" step="1" value="10" data-param="barSeconds">
    </label>
    <label>
      Horizon: <output data-value="minutes">30m</output>
      <input type="range" min="10" max="60" step="5" value="30" data-param="minutes">
    </label>
  </div>
  <div class="epps-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="640" aria-label="Epps effect simulator showing correlation versus sampling interval, lead-lag scan, observation clocks, and estimator comparison"></canvas>
  <div class="epps-lab__legend">
    <span><i style="background:#64748b"></i> Latent clock</span>
    <span><i style="background:#0f766e"></i> Previous-tick bars</span>
    <span><i style="background:#7c3aed"></i> Hayashi-Yoshida</span>
    <span><i style="background:#be123c"></i> Lead-lag scan</span>
    <span><i style="background:#2563eb"></i> Fast asset</span>
    <span><i style="background:#f59e0b"></i> Slow asset</span>
  </div>
  <p class="epps-lab__note">
    Deterministic synthetic experiment. The latent price paths are correlated
    Brownian-style walks with an optional lagged common shock. Observed prices
    arrive on independent trading clocks and include simple additive
    microstructure noise. This is a data-quality microscope, not a trading
    strategy.
  </p>
</div>
<script src="{{ '/assets/js/epps-effect-lab.js?v=20260613a' | relative_url }}"></script>

Start with the default setting. The latent correlation is high. The one-second
previous-tick correlation is much lower. As the bar interval grows, the
observed correlation climbs toward the latent one. That rising curve is the
Epps effect in miniature.

Now lower **slow ticks**. The slow asset becomes stale more often, so the
previous-tick grid keeps copying old prices forward. Short-horizon correlation
falls, not because the economic relation disappeared, but because the two
return intervals stopped lining up.

Set **physical lag** to zero. The lead-lag scan may still wobble. Some apparent
lags are pure sampling noise. Now raise the physical lag to eight seconds and
use small bars. The peak moves. A real lag is visible, but its measured size and
strength depend on the bar size and the observation clocks.

Finally raise **noise**. Very short bars become fragile because the signal per
bar is tiny while the noise is not. Aggregation helps, but aggregation also
changes the question. A five-minute correlation is not a one-second trading
edge.

## The Estimator That Refuses a Grid

The usual realized covariance estimator wants synchronous observations:

$$
\sum_k \Delta_k X \Delta_k Y.
$$

But synchronous observations are exactly what high-frequency markets do not
give you. Hayashi and Yoshida proposed an estimator for nonsynchronously
observed diffusion processes that uses overlapping return intervals instead of
forcing both assets onto a regular grid.[^hy]

In the simple two-asset case, write the observed increments as

$$
\Delta X_i = X_{T_i} - X_{T_{i-1}},
\qquad
\Delta Y_j = Y_{S_j} - Y_{S_{j-1}}.
$$

The Hayashi-Yoshida covariance is

$$
\widehat{[X,Y]}_{\mathrm{HY}}
=
\sum_i \sum_j
\Delta X_i \Delta Y_j
\mathbf{1}
\left\{
(T_{i-1},T_i] \cap (S_{j-1},S_j] \neq \emptyset
\right\}.
$$

The indicator is the important part. It asks whether the physical time
intervals overlap. If they do, the increments contribute. If they do not, they
do not.

This is not magic. It does not remove all microstructure noise. It does not
prove that an observed lead-lag is economic. It does, however, refuse to pretend
that two assets traded on the same clock when they did not. More elaborate
estimators handle both asynchronous observation and market microstructure noise;
Ait-Sahalia, Fan, and Xiu, for example, combine generalized synchronization
with a quasi-maximum likelihood approach for noisy asynchronous covariance
estimation.[^afx] Zhang's work on estimating covariation under the Epps effect
and microstructure noise is another useful warning that naive previous-tick
covariance can be biased, especially for less liquid assets.[^zhang]

The practical lesson is humble:

```text
the synchronization scheme is part of the model
```

If two researchers use the same raw trades but different synchronization rules,
they can produce different correlations, different lags, and different
strategies.

## When the Lag Is Real

None of this means lead-lag effects are fake.

Markets do not process information simultaneously. Index futures can move
before cash equities. ETFs, ADRs, options, sector baskets, and correlated
single names can incorporate information at different speeds. Venue latency,
market-maker inventory, tick size, queue position, and news dissemination can
all create real ordering in time.

The danger is that the empirical signature of a real lead-lag effect and the
empirical signature of a clock artifact can look similar:

1. the cross-correlation curve peaks away from zero;
2. the peak is stronger at short bars;
3. the signal weakens after transaction costs;
4. the effect is concentrated in less liquid names;
5. the backtest is sensitive to timestamp choices.

Those facts do not kill the signal, but they change the burden of proof. A
lead-lag strategy needs a clock audit before it deserves an economic story.

Reno's empirical and simulation work argued that the Epps effect can largely be
explained by nonsynchronicity and lead-lag relationships.[^reno] More recent
work has even used the shape of the Epps effect as a diagnostic for whether
tick data is better described by sampled diffusions or by connected point
processes.[^discrete] That is the deeper research direction: the Epps curve is
not merely a nuisance. It is a fingerprint of the data-generating mechanism.

## The Clock Audit

Here is the checklist I would want before trusting a high-frequency lag:

**Timestamp provenance.** Are the timestamps exchange timestamps, SIP
timestamps, broker receive timestamps, vendor-normalized timestamps, or machine
arrival timestamps? Are they comparable across venues? Were corrections,
sequence gaps, auctions, halts, and crossed markets handled explicitly?

**Trade versus quote.** Is the signal built from trades, midquotes, bid/ask
quotes, or last sale prices? Trade prices carry bid-ask bounce. Quotes can be
fleeting or locked. Midquotes can move without executable size.

**Synchronization rule.** Does the research use previous tick, next tick,
linear interpolation, refresh time, event time, calendar time, quote time, or an
overlap estimator? The rule should be written down like a model assumption.

**Sampling curve.** Does the effect survive a sweep over bar sizes? If a
strategy exists only at one arbitrary interval, it may be discovering the
researcher's grid.

**Lead-lag stability.** Is the lag stable across days, regimes, symbols, venues,
and liquidity buckets? A real market mechanism should leave more structure than
a single pretty peak.

**Execution clock.** Does the backtest use information available before the
trade decision, including feed latency and order-routing delay? A signal that
predicts the past by two milliseconds is not alpha. It is a timestamp bug.

**Cost and queue realism.** If the edge is measured in basis points or less,
spread, fees, rebates, queue priority, adverse selection, and market impact are
not frictions after the fact. They are the experiment.

The audit is boring in the way good plumbing is boring. That is why it matters.
In a slow monthly factor, a one-second timestamp convention is invisible. In a
one-second strategy, it can be the whole result.

## A Small Research Program

The next step I would like to build is not a bigger backtest. It is a clock
stress test.

Take a candidate lead-lag signal and run it through a battery of perturbations:

1. randomly thin the more liquid asset's ticks;
2. add controlled timestamp jitter;
3. switch between previous-tick, refresh-time, and overlap estimators;
4. sweep the bar interval from subsecond to minutes;
5. bucket results by liquidity, spread, and trading intensity;
6. measure how much PnL remains after imposing feed and execution delays.

If the alpha survives, the story becomes stronger. If it collapses, that is not
a failed research day. It is a good discovery: the strategy was a clock.

The best high-frequency research has this texture. It treats market data not as
a spreadsheet of prices, but as a physical measurement system. Every row has a
clock. Every clock has an error model. Every synchronization choice is an
assumption about time.

The market may still contain a lead. But first, prove it is not your watch.

## Works Cited

[^epps]: Thomas W. Epps, ["Comovements in Stock Prices in the Very Short Run"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1979.10482508), *Journal of the American Statistical Association*, 1979. See also the [JSTOR record](https://www.jstor.org/stable/2286325).

[^lo]: Andrew W. Lo and A. Craig MacKinlay, ["An Econometric Analysis of Nonsynchronous Trading"](https://ideas.repec.org/a/eee/econom/v45y1990i1-2p181-211.html), *Journal of Econometrics*, 1990. An NBER version is available as [working paper 2960](https://www.nber.org/papers/w2960).

[^hy]: Takaki Hayashi and Nakahiro Yoshida, ["On Covariance Estimation of Non-Synchronously Observed Diffusion Processes"](https://projecteuclid.org/journals/bernoulli/volume-11/issue-2/On-covariance-estimation-of-non-synchronously-observed-diffusion-processes/10.3150/bj/1116340299.pdf), *Bernoulli*, 2005.

[^afx]: Yacine Ait-Sahalia, Jianqing Fan, and Dacheng Xiu, ["High-Frequency Covariance Estimates With Noisy and Asynchronous Financial Data"](https://www.tandfonline.com/doi/abs/10.1198/jasa.2010.tm10163), *Journal of the American Statistical Association*, 2010. A copy is available from [Dacheng Xiu's page](https://dachxiu.chicagobooth.edu/download/QMLE2D.pdf).

[^zhang]: Lan Zhang, ["Estimating Covariation: Epps Effect, Microstructure Noise"](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=885438), *Journal of Econometrics*, 2011.

[^reno]: Roberto Reno, ["A Closer Look at the Epps Effect"](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=314723), *International Journal of Theoretical and Applied Finance*, 2003.

[^discrete]: The 2025 paper ["Detecting Discrete Processes with the Epps Effect"](https://www.aimsciences.org/article/doi/10.3934/fmf.2025002?viewType=HTML) uses Epps-effect behavior as evidence about possible underlying representations of high-frequency data, comparing diffusion, microstructure-noise, and Hawkes-style point-process settings.
