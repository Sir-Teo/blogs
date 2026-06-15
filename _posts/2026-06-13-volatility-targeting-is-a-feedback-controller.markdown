---
layout: post
title: "Risk Dials Have Delays"
description: "Scaling exposure by estimated volatility is not a free Sharpe-ratio machine. It is a lagged control loop with estimator error, leverage caps, turnover, and crash dynamics."
date: 2026-06-13 03:44:00 -0400
categories: quantitative-finance
series: quantitative-trading
tags: [volatility-targeting, quantitative-finance, risk-management, control, garch, portfolio-construction]
excerpt: "Volatility targeting estimates risk, sets leverage, pays turnover, and hopes the sensor moves before the regime does."
---

Volatility targeting has the appealing smell of common sense.

If an asset becomes twice as volatile, hold half as much. If it becomes quiet,
hold more. The portfolio now has a steadier risk budget, drawdowns are less
violent, and the strategy may even earn a better Sharpe ratio. Many trend,
macro, risk-parity, and managed-futures systems contain some version of this
rule.

The rule is so simple that it is easy to forget what it really is:

$$
w_t =
\mathrm{clip}
\left(
\frac{\sigma^\*}{\hat{\sigma}_t},
0,
L_{\max}
\right).
$$

Here $$w_t$$ is exposure, $$\sigma^\*$$ is target volatility,
$$\hat{\sigma}_t$$ is an estimate made from past returns, and $$L_{\max}$$ is a
leverage cap. The next day's portfolio return is approximately

$$
R_{t+1}^{\mathrm{target}}
=
w_t R_{t+1}
-
c |w_t - w_{t-1}|.
$$

That last equation is less romantic. The strategy has a sensor, an actuator,
latency, saturation, and friction. It is not a spell that turns volatility into
return. It is a feedback controller.

This post builds a toy controller around a simulated risky asset with
volatility clustering, stress shocks, jump losses, lagged volatility estimates,
leverage caps, and transaction costs. The point is not to backtest a tradable
strategy. The point is to make the control loop visible.

This is not investment advice.

## Why the Dial Sometimes Helps

Volatility is predictable in a way returns usually are not. Engle's ARCH model
and Bollerslev's GARCH model made that empirical fact mathematically central:
large returns tend to cluster with large returns, and quiet periods tend to
cluster with quiet periods.[^engle], [^bollerslev] Later realized-volatility
work used high-frequency returns to make the same fact sharper: volatility is a
state variable one can estimate and forecast better than one can forecast the
sign of tomorrow's return.[^andersen]

If expected returns do not rise enough during high-volatility states, then
constant exposure spends too much risk budget precisely when each dollar of
exposure is dangerous. Moreira and Muir's volatility-managed portfolios make
this argument empirically: scale factor portfolios by inverse realized variance,
and many portfolios produce large alphas relative to the unscaled versions.[^moreira]

Momentum is a particularly vivid case. Barroso and Santa-Clara show that
momentum crashes are forecastable by momentum's own realized variance, and that
volatility scaling can sharply reduce crash risk.[^barroso] Daniel and
Moskowitz connect momentum crashes to panic states and market rebounds, where a
strategy that is implicitly short high-beta losers can get hit hard.[^daniel]

But "can work" is not "must work." Harvey et al. study volatility targeting
across assets and strategies and find the impact varies: it tends to help
equities and credit more than bonds and currencies, and it is most useful when
volatility is persistent and negatively related to returns.[^harvey] That is
exactly the control interpretation. The rule helps when the sensor measures a
real state, the actuator changes risk before the bad state pays out, and the
asset does not fully compensate investors for bearing that state.

## The Controller on the Bench

The controller below observes only past returns. It estimates volatility with an
EWMA:

$$
\hat{\sigma}_{t+1}^2
=
\lambda \hat{\sigma}_t^2
+
(1-\lambda) R_t^2.
$$

The half-life slider controls $$\lambda$$. A short half-life reacts quickly but
trades a lot and chases noise. A long half-life trades less but arrives late.

The simulated asset has a hidden annualized volatility, stress shocks that decay
slowly, occasional negative jumps during stress, and a configurable link between
volatility and expected return. If the risk-premium slope is zero, high
volatility brings more risk but not more expected return. If the slope is
positive, high-volatility states are more compensated. If it is negative, high
volatility is also a bad expected-return state.

<div class="voltarget-lab" data-voltarget-lab>
  <div class="voltarget-lab__controls">
    <label>
      Target volatility: <output data-value="targetVol">12%</output>
      <input type="range" min="5" max="22" step="1" value="12" data-param="targetVol">
    </label>
    <label>
      EWMA half-life: <output data-value="halfLife">20</output>
      <input type="range" min="4" max="90" step="1" value="20" data-param="halfLife">
    </label>
    <label>
      Max leverage: <output data-value="maxLev">2.5x</output>
      <input type="range" min="80" max="400" step="10" value="250" data-param="maxLev">
    </label>
    <label>
      Risk-premium slope: <output data-value="premium">0%</output>
      <input type="range" min="-90" max="130" step="10" value="0" data-param="premium">
    </label>
    <label>
      Stress intensity: <output data-value="stress">55%</output>
      <input type="range" min="0" max="100" step="5" value="55" data-param="stress">
    </label>
    <label>
      Trading cost: <output data-value="cost">2 bps</output>
      <input type="range" min="0" max="25" step="1" value="2" data-param="cost">
    </label>
  </div>
  <div class="voltarget-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="620" aria-label="Volatility targeting simulator showing wealth, volatility estimates, leverage, drawdowns, and risk metrics"></canvas>
  <div class="voltarget-lab__legend">
    <span><i style="background:#64748b"></i> Raw 1x asset</span>
    <span><i style="background:#0f766e"></i> Vol-targeted portfolio</span>
    <span><i style="background:#be123c"></i> Hidden volatility</span>
    <span><i style="background:#2563eb"></i> Lagged estimate</span>
  </div>
  <p class="voltarget-lab__note">
    Deterministic synthetic experiment. The controller uses lagged EWMA
    volatility, applies a leverage cap, and pays turnover costs. It does not
    know the hidden volatility path used to generate returns.
  </p>
</div>
<script defer src="{{ '/assets/js/vol-target-lab.js' | relative_url }}"></script>

The default setting is deliberately friendly to volatility targeting:
volatility clusters, stress produces jumps, and high volatility is not paid with
proportionally higher expected return. The controller usually lowers drawdown
and improves Sharpe, but it does so by spending much of the sample below 1x
exposure. It is not producing return from nowhere. It is refusing exposure in
dangerous states.

Now try breaking it.

Raise the risk-premium slope. If high-volatility states are strongly
compensated, the controller de-risks exactly when the asset is paying for risk.
The Sharpe improvement can shrink or reverse. This is the central economic
question behind volatility targeting: are high-volatility states bad states, or
are they paid states?

Shorten the half-life to five days and raise trading costs. The controller now
hears every squeak in the return series and pays for reacting. Turnover climbs.
The realized volatility may look controlled, but the cost line is quietly
eating the benefit.

Lengthen the half-life and increase stress intensity. The estimate becomes
smooth, but smooth means late. A volatility shock can arrive before the
controller has cut exposure. This is the oldest risk-management problem in a new
costume: yesterday's measurement is not tomorrow's state.

Lower the leverage cap. The cap protects the system during quiet periods, but
it also means the target volatility may be unreachable when the asset is calm.
The portfolio is no longer a pure volatility target. It is a capped controller
with a target it can only sometimes hit.

## The Sensor Is a Position

Most discussions treat the volatility estimator as plumbing. It is not. It is a
position.

A short half-life is a bet that the latest squared returns are informative and
that speed matters more than noise. A long half-life is a bet that regimes move
slowly and that turnover is expensive. A realized-volatility estimator using
intraday data is a bet that microstructure noise and data quality can be
managed. A GARCH model is a bet that a parametric recursion captures enough of
the state. A high quantile or stressed-vol estimator is a bet that being early
to de-risk is worth being underinvested.

The allocation inherits the estimator's errors directly:

$$
\frac{w_t}{w_t^{\mathrm{oracle}}}
=
\frac{\sigma_t}{\hat{\sigma}_t}
$$

when the leverage cap is not binding. Underestimate volatility by 30%, and the
portfolio is roughly 43% too levered. Overestimate volatility by 30%, and the
portfolio is roughly 23% underinvested. The asymmetry is mechanical because the
estimate is in the denominator.

This denominator is why volatility targeting feels stable until it suddenly
does not. During calm periods, estimated volatility can drift down and leverage
can drift up. If the next regime change is a jump rather than a gradual
transition, the controller's first observation of the new state is also a loss.

## Sharpe Can Improve Without Magic

Volatility targeting can improve Sharpe even if it does not forecast returns
directly.

Suppose expected excess return is roughly constant while volatility moves. The
raw strategy spends equal dollars in high- and low-volatility states. The
vol-targeted strategy spends equal risk. It has less exposure when variance is
high and more exposure when variance is low. If high-volatility states do not
pay enough extra return, this is a form of variance timing.

That is not alpha in the mystical sense. It is a change in the distribution of
exposure across states.

The opposite case is just as important. If expected returns rise strongly with
volatility, then inverse-vol scaling can reduce exposure when compensation is
highest. The rule may still reduce drawdowns, but the cost is lower expected
return. Whether that trade is acceptable depends on utility, constraints, and
the institution's ability to survive losses.

This is why volatility targeting should be evaluated by more than Sharpe:

1. realized volatility relative to target;
2. drawdown depth and recovery time;
3. skew and tail loss;
4. turnover and implementation cost;
5. leverage distribution;
6. exposure during high-expected-return states;
7. behavior immediately after jumps.

The last item matters because many volatility estimators are reactive. They are
excellent at explaining why yesterday was risky. A controller needs to decide
what to own tomorrow.

## Smooth Risk Can Hide a Crowd

Volatility targeting can make a strategy look civilized. The realized volatility
line becomes flatter. The drawdowns may become smaller. Monthly risk reports
look less embarrassing.

That smoothness can hide a new concentration: exposure is now highest after
quiet periods. If many managers use similar estimators and similar targets, they
may increase exposure in the same calm states and reduce exposure in the same
stress states. The individual controller is stabilizing its own risk. The crowd
may be creating a common feedback channel.

This does not mean volatility targeting is bad. It means it is a policy, not a
statistic. Policies interact.

In execution, leverage also has funding, margin, borrow, and liquidity costs.
The lab charges only a simple turnover cost. Real portfolios pay in many
currencies: bid-ask spread, financing, slippage, market impact, operational
complexity, and the possibility that leverage is least available when the model
most wants it.

The rule should therefore be written in its honest form:

$$
\text{target risk}
\quad
\text{subject to}
\quad
\text{lag, caps, costs, liquidity, and survival}.
$$

That is less elegant than $$\sigma^\*/\hat{\sigma}$$. It is closer to the
portfolio.

## Signals I Would Watch

If I had to run a volatility-targeted strategy, I would not start by watching
realized volatility alone. That is the easiest metric to flatter.

I would monitor estimator error during known stress episodes: how much exposure
was still on when volatility jumped? I would track the distribution of leverage,
not only the average. I would decompose turnover by ordinary rebalancing versus
stress response. I would measure whether high-volatility states historically had
positive, neutral, or negative expected returns for the specific asset or signal
being scaled.

I would also report a no-leverage version and a capped version. If all the
benefit comes from levering quiet states, the strategy is partly a financing
strategy. That may be fine, but it should be priced as such.

Finally, I would test estimator diversity. EWMA, GARCH, realized volatility,
option-implied volatility, and stress quantiles will disagree. The disagreement
is information. When the estimators diverge, the controller is operating in a
state where its sensor is uncertain.

Volatility targeting is useful because volatility is more forecastable than
return. It is dangerous when that sentence becomes a substitute for the rest of
the control problem.

The rule is small:

$$
w_t = \sigma^\*/\hat{\sigma}_t.
$$

The system around it is not.

## Primary Sources

[^engle]: Robert F. Engle, "Autoregressive Conditional Heteroscedasticity with Estimates of the Variance of United Kingdom Inflation," *Econometrica*, 1982. [JSTOR](https://www.jstor.org/stable/1912773).

[^bollerslev]: Tim Bollerslev, "Generalized Autoregressive Conditional Heteroskedasticity," *Journal of Econometrics*, 1986. [ScienceDirect](https://www.sciencedirect.com/science/article/pii/0304407686900631).

[^andersen]: Torben G. Andersen, Tim Bollerslev, Francis X. Diebold, and Paul Labys, "Modeling and Forecasting Realized Volatility," *Econometrica*, 2003. [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/1468-0262.00418).

[^moreira]: Alan Moreira and Tyler Muir, "Volatility-Managed Portfolios," *Journal of Finance*, 2017. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2659431).

[^barroso]: Pedro Barroso and Pedro Santa-Clara, "Momentum has its moments," *Journal of Financial Economics*, 2015. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0304405X14001582).

[^daniel]: Kent Daniel and Tobias J. Moskowitz, "Momentum crashes," *Journal of Financial Economics*, 2016. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0304405X16301490).

[^harvey]: Campbell R. Harvey, Edward Hoyle, Russell Korgaonkar, Sandy Rattray, Matthew Sargaison, and Otto Van Hemert, "The Impact of Volatility Targeting," 2018. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3175538).
