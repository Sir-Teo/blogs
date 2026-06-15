---
layout: post
title: "The Hedge Is a Variance Meter"
description: "A delta-hedged option does not merely bet on direction. It keeps a ledger of realized variance, rebalancing error, jumps, and transaction costs."
date: 2026-06-15 10:31:00 -0400
categories: quantitative-finance
tags: [options, delta-hedging, volatility, gamma, transaction-costs, quantitative-finance]
excerpt: "Black-Scholes replication is a limit theorem with a trading diary. Once hedging is discrete and costly, the diary starts measuring realized variance."
---

An option price looks like a number.

A hedge makes it a diary.

Every rebalance writes down what the underlying did, how much delta changed,
how much spread was paid, and whether a smooth diffusion assumption just met a
large jump. By expiry, the position has not merely won or lost money. It has
measured the path.

```text
the option was sold at implied variance
the hedge settled at realized variance
```

This is the useful way to read a delta-hedged option. Direction matters, but
after delta is repeatedly neutralized, the larger residual question is not
"where did the stock end?" It is closer to:

```text
how much path did the stock spend
while the option still had gamma?
```

<div class="callout">
  <strong>Thesis:</strong> Black-Scholes is often taught as a pricing formula,
  but its more durable lesson is replication. A delta hedge converts an option
  into a pathwise accounting problem: gamma collects realized variance, theta
  pays for time, and frictions decide how much of the theoretical edge survives.
</div>

## The Formula Hides a Trading Schedule

Black and Scholes derived their option-pricing equation by constructing a
portfolio whose risk could be locally hedged away.[^black-scholes] Merton
placed the same argument inside a broader rational option-pricing framework.[^merton]
In the clean model, the stock follows a continuous lognormal diffusion, markets
are frictionless, and the hedge can be revised continuously. Under those
conditions the option's price is not a forecast. It is the cost of maintaining
the replicating portfolio.

That last phrase is the hinge. "Continuously" is doing heroic work.

A real hedge is updated on a schedule:

1. Compute the option delta.
2. Buy or sell stock to offset the option's local directional exposure.
3. Wait.
4. Discover that the stock moved before the hedge could be made continuous.
5. Pay the spread and do it again.

Boyle and Emanuel analyzed this discrete-adjustment problem in 1980: when
hedges are revised at finite intervals, replication error remains.[^boyle]
Leland later studied how transaction costs alter the replication problem,
developing a modified strategy that depends on both the cost rate and hedge
frequency.[^leland] The lesson is not subtle:

```text
continuous replication is a limit,
not a fill report
```

The formula is elegant because it suppresses the diary. The trader still has to
write it.

## Gamma Turns Motion Into a Bill

For a small move $$dS$$ over a small time interval $$dt$$, a Taylor expansion of
the option value gives

$$
dV
\approx
\Delta\,dS
+ \Theta\,dt
+ \frac{1}{2}\Gamma(dS)^2.
$$

If you are short the option and long $$\Delta$$ shares, the first-order
directional term is mostly canceled. What remains is approximately

$$
d\Pi_{\text{short, hedged}}
\approx
-\Theta\,dt
-\frac{1}{2}\Gamma(dS)^2
-\text{trading costs}.
$$

For a vanilla long call, theta is usually negative, so $$-\Theta\,dt$$ is
positive carry to the short. Gamma is positive, so the realized squared move is
a cost to the short. A quiet path lets theta accumulate. A violent path sends
gamma the invoice.

This is why people say a delta-hedged option is a volatility trade. The short
option seller received an implied volatility in the premium. The hedge then
experiences realized volatility. If realized variance is lower than the
variance embedded in the option price, the short hedge tends to make money
before frictions. If realized variance is higher, the gamma bill can dominate.

Carr and Madan's volatility-trading work made this pathwise viewpoint more
explicit for variance contracts and option portfolios.[^carr-madan] Derman,
Demeterfi, Kamal, and Zou similarly emphasize that variance swaps isolate
volatility exposure more directly than vanilla options, whose volatility
exposure is mixed with spot dependence.[^derman] A single delta-hedged vanilla
option is not a pure variance swap. But the intuition is nearby: hedging peels
away first-order direction and leaves a noisy variance ledger.

## A Small Hedge Diary

The lab below sells one European call, buys delta shares, and rebalances on a
chosen schedule. It marks the short-option hedge through time, using the
Black-Scholes delta, gamma, and theta at each step.

Default setting:

- spot starts at `100`;
- strike is `100`;
- maturity is `60` trading days;
- implied volatility is `22%`;
- simulated realized volatility is `18%`;
- the hedge is revised daily;
- the bid/ask cost is `4` bps of stock notional traded.

With the default seed, the path realizes about `19.6%` volatility and has no
jump day. The short option hedge ends around `+0.40` after paying about `0.13`
in trading cost. The positive result is not a free lunch. It is the particular
path's realized variance being below the variance sold, after this hedge
schedule and this cost model.

<style>
  .delta-hedge-lab {
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

  .delta-hedge-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .delta-hedge-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .delta-hedge-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .delta-hedge-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .delta-hedge-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .delta-hedge-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .delta-hedge-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.04rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .delta-hedge-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .delta-hedge-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .delta-hedge-lab__legend span,
  .delta-hedge-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .delta-hedge-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .delta-hedge-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="delta-hedge-lab" data-delta-hedge-lab>
  <div class="delta-hedge-lab__controls">
    <label>
      Seed <output data-value="seed">42</output>
      <input type="range" data-param="seed" min="1" max="99" step="1" value="42">
    </label>
    <label>
      Days <output data-value="days">60</output>
      <input type="range" data-param="days" min="20" max="126" step="1" value="60">
    </label>
    <label>
      Hedge every <output data-value="hedgeEvery">1</output> days
      <input type="range" data-param="hedgeEvery" min="1" max="21" step="1" value="1">
    </label>
    <label>
      Implied vol <output data-value="impliedVol">22%</output>
      <input type="range" data-param="impliedVol" min="5" max="70" step="1" value="22">
    </label>
    <label>
      Realized vol <output data-value="realizedVol">18%</output>
      <input type="range" data-param="realizedVol" min="5" max="80" step="1" value="18">
    </label>
    <label>
      Jump intensity <output data-value="jumpIntensity">6%</output>
      <input type="range" data-param="jumpIntensity" min="0" max="40" step="1" value="6">
    </label>
    <label>
      Spread bps <output data-value="spreadBps">4</output>
      <input type="range" data-param="spreadBps" min="0" max="60" step="1" value="4">
    </label>
    <label>
      Strike <output data-value="strike">100</output>
      <input type="range" data-param="strike" min="80" max="120" step="1" value="100">
    </label>
  </div>
  <div class="delta-hedge-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Delta hedging simulator showing spot path, hedge shares, P&L attribution, rebalance sweep, realized volatility, and transaction costs"></canvas>
  <div class="delta-hedge-lab__legend">
    <span><i style="background:#2563eb"></i> Spot</span>
    <span><i style="background:#7c3aed"></i> Hedge shares</span>
    <span><i style="background:#0f766e"></i> Positive P&L</span>
    <span><i style="background:#be123c"></i> Loss or jump</span>
    <span><i style="background:#d97706"></i> Cost / gamma-theta proxy</span>
  </div>
  <p class="delta-hedge-lab__note">
    Deterministic toy model. The audit covers 82 settings for finite P&L,
    nonnegative trading costs, bounded realized volatility, and the expected
    direction that a higher-realized-volatility path hurts the short option
    hedge when other settings are fixed.
  </p>
</div>
<script defer src="{{ '/assets/js/delta-hedge-lab.js?v=20260615a' | relative_url }}"></script>

Turn up **Realized vol**. The short option starts receiving the same implied
premium, but the path spends more squared motion. The gamma bill grows. Turn up
**Spread bps**. The continuous-theory edge is eaten by the act of trying to
make theory discrete. Increase **Hedge every**. Costs usually fall because
there are fewer trades, but hedge error can become lumpier. Turn up **Jump
intensity** and change the seed. A discontinuity is not just "more variance";
it is motion that arrives before the hedge can move.

The rebalance sweep is deliberately path-specific. It is not claiming "hedge
less often is better." It is showing the tradeoff on the same realized path:
frequent hedging reduces local delta error but pays more spread; infrequent
hedging saves cost but lets the position carry stale delta.

## The Wrong Lesson Is Precision

The Black-Scholes equation can seduce people into thinking the hard part is
getting a more precise number. Precision helps, but the hedge ledger asks a
more physical question:

```text
what assumptions must the market honor
for this number to become a replication?
```

Continuous paths matter because gamma losses arrive through squared moves.
Continuous trading matters because delta is only local. Zero transaction costs
matter because every rebalance otherwise turns the proof into a bill. Known
volatility matters because a hedge priced at one variance and lived at another
variance is not neutral to the mismatch.

El Karoui, Jeanblanc-Picque, and Shreve studied robustness of the Black-Scholes
formula when the volatility used for pricing and hedging may differ from the
true volatility process.[^robust] The high-level lesson fits the lab: hedging
is robust in some ordered cases, but model misspecification still lives in the
cost process. A dominating volatility assumption can superreplicate in a clean
diffusion world; it does not make spreads disappear, jumps continuous, or
liquidity infinite.

## What the Diary Should Record

For an options book, the daily P&L should not be a single mysterious number.
At minimum, I want to see:

1. Starting Greeks and ending Greeks.
2. Delta hedge P&L from stock movement.
3. Gamma/theta approximation.
4. Vega and implied-volatility re-mark.
5. Transaction costs and slippage.
6. Jump or gap days separated from ordinary diffusion days.
7. Realized variance over the option's remaining gamma profile.
8. Residual unexplained P&L.

The residual is not embarrassment. It is a research queue. It can point to
stale marks, bad dividends, borrow effects, local-volatility dynamics, skew
exposure, execution quality, missing corporate actions, or just the fact that a
second-order Taylor diary is not the market.

That is why the hedge is a variance meter, not an oracle. It measures through a
particular instrument, schedule, and set of frictions. The reading is useful
only when the measurement device is named.

The option price was the headline.

The hedge was the experiment.

[^black-scholes]: Fischer Black and Myron Scholes, ["The Pricing of Options and Corporate Liabilities"](https://www.journals.uchicago.edu/doi/10.1086/260062), Journal of Political Economy, 1973.

[^merton]: Robert C. Merton, ["Theory of Rational Option Pricing"](https://www.hbs.edu/faculty/Pages/item.aspx?num=8804), Bell Journal of Economics and Management Science, 1973.

[^boyle]: Phelim P. Boyle and David Emanuel, ["Discretely Adjusted Option Hedges"](https://ideas.repec.org/a/eee/jfinec/v8y1980i3p259-282.html), Journal of Financial Economics, 1980.

[^leland]: Hayne E. Leland, ["Option Pricing and Replication with Transactions Costs"](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.1985.tb02383.x), Journal of Finance, 1985.

[^carr-madan]: Peter Carr and Dilip Madan, ["Towards a Theory of Volatility Trading"](https://pricing.online.fr/docs/TradingVolatilityStrat.pdf), in *Volatility: New Estimation Techniques for Pricing Derivatives*, 1998.

[^derman]: Emanuel Derman, Kresimir Demeterfi, Michael Kamal, and Joseph Zou, ["More Than You Ever Wanted to Know About Volatility Swaps"](https://emanuelderman.com/wp-content/uploads/1999/02/gs-volatility_swaps.pdf), Journal of Derivatives, 1999.

[^robust]: Nicole El Karoui, Monique Jeanblanc-Picque, and Steven E. Shreve, ["Robustness of the Black and Scholes Formula"](https://econpapers.repec.org/RePEc%3Abla%3Amathfi%3Av%3A8%3Ay%3A1998%3Ai%3A2%3Ap%3A93-126), Mathematical Finance, 1998.
