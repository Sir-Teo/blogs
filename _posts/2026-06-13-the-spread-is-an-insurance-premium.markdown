---
layout: post
title: "Spreads Price Inventory Risk"
description: "A bid-ask spread is not one cost. It is a compact price for immediacy, adverse selection, inventory risk, and the mechanics of running a market."
date: 2026-06-13 10:12:00 -0400
categories: quantitative-finance
tags: [market-microstructure, bid-ask-spread, adverse-selection, liquidity, inventory-risk, quantitative-finance]
excerpt: "The midpoint feels like the price and the spread feels like friction. In a microstructure model, the spread is a premium charged by someone who must trade before knowing why you are trading."
---

The midpoint has a dangerous charisma.

It sits exactly between bid and ask, looks mathematically neutral, and invites
you to call it "the price." The spread then becomes a nuisance around the price:
two ticks of noise, a commission in disguise, the small toll paid by impatient
traders.

That picture is too polite. A spread is not merely a fee. It is a compact
insurance premium sold by a liquidity provider who has to answer a hard
question before the rest of the market does:

```text
Why is this person willing to trade with me right now?
```

Sometimes the answer is boring. A fund has an inflow. A hedger reduces risk. A
retail order arrives because someone tapped buy. Sometimes the answer is not
boring. The trader knows something, or predicts something, or is connected to a
larger flow that will move the price after the market maker fills the order.

The spread is the little object where those possibilities get priced.

<div class="callout">
  <strong>Microstructure rule:</strong> the spread is not outside the price
  process. It is one of the ways the price process learns who wanted immediacy.
</div>

## A Dealer Who Must Guess

The cleanest starting point is the Glosten-Milgrom model.[^glosten] There is a
risky asset with unknown value $$V$$. Some traders know more about $$V$$ than
the market maker; others trade for liquidity reasons. A competitive specialist
sets quotes before seeing whether the next order comes from information or
noise.

The zero-profit logic is brutal:

$$
a = E[V \mid \text{buy order}] + c,
\qquad
b = E[V \mid \text{sell order}] - c,
$$

where $$a$$ is the ask, $$b$$ is the bid, and $$c$$ is the order-processing
cost. The dealer sells at the ask to someone who wants to buy. If buys are more
likely when the asset is underpriced, the dealer's conditional expectation after
seeing a buy is above the unconditional midpoint. Symmetrically, a sell order
pushes the conditional expectation downward.

So the spread is

$$
a-b
=
2c
+
\left(E[V \mid \text{buy}] - E[V \mid \text{sell}]\right).
$$

The first term is mechanical. The second is informational. It is the price of
not knowing whether the trader across the screen is uninformed, early, or simply
better.

A small binary version is enough to feel the model. Suppose the asset value is
either $$+\Delta$$ or $$-\Delta$$ around the current midpoint. A fraction
$$\alpha$$ of incoming traders are informed. An informed trader receives a
directional signal that is correct with probability $$s$$; a noise trader buys
with probability $$\beta$$. Then

$$
\Pr(\text{buy}\mid H)
=
\alpha s + (1-\alpha)\beta,
$$

and

$$
\Pr(\text{buy}\mid L)
=
\alpha(1-s) + (1-\alpha)\beta.
$$

Bayes' rule turns the order into a posterior. When noise flow is balanced
($$\beta=1/2$$), the adverse-selection half-spread in this toy model reduces to

$$
\alpha(2s-1)\Delta.
$$

That formula is almost too small for what it says. More informed flow, more
accurate information, or a larger value jump all widen the quote. The dealer is
not being greedy in the model. The dealer is refusing to sell insurance at a
price that ignores the accident rate.

## Inventory Has a Shadow Price

Adverse selection is only one reason the spread exists. A market maker also
accumulates inventory.

If the dealer buys from sellers all morning, the position grows. The next quote
cannot be the same quote as before. A long-inventory dealer would like to sell,
so the quote center may shift down; a short-inventory dealer would like to buy,
so the quote center may shift up. Risk aversion, capital limits, and volatility
make inventory costly even when every incoming trader is uninformed.

Ho and Stoll framed dealer quotes as an optimal-control problem under
transaction and return uncertainty: bid and ask prices depend on the dealer's
state, not only on a single fair value.[^hostoll] Kyle's continuous-auction
model gives a complementary view from the informed-trading side: market depth is
the conversion rate between order flow and price impact when competitive market
makers infer information from net demand.[^kyle]

The practical conclusion is simple:

```text
two markets can have the same midpoint and different executable prices
because they have different information risk and different inventory capacity
```

That is why "spread" is a liquidity statistic, not just a nuisance number. It
is a compressed summary of who is willing to warehouse risk, how much adverse
selection they expect, how quickly inventory can be recycled, and how expensive
it is to keep the trading machine running.

## A Small Spread Laboratory

The lab below is a deliberately small dealer model. It is not a full limit-order
book and not a trading system. It has one market maker, binary information,
noise flow, order-processing cost, and a crude inventory-risk adjustment. The
goal is not realism. The goal is to make the decomposition visible.

The model computes the Bayesian conditional values at the bid and ask, simulates
a deterministic pseudo-random tape of trades, marks the dealer's inventory to
the evolving efficient value, and estimates a Roll-style spread from transaction
prices. Try to break it. Raise informed flow. Make the signal accurate. Add a
buy imbalance. Remove order cost and let adverse selection do the widening.

<div id="spread-lab" class="spread-lab" data-spread-lab>
  <div class="spread-lab__controls">
    <label>
      Informed flow: <output data-value="informed">25%</output>
      <input type="range" min="0" max="70" step="1" value="25" data-param="informed">
    </label>
    <label>
      Signal accuracy: <output data-value="accuracy">90%</output>
      <input type="range" min="50" max="100" step="1" value="90" data-param="accuracy">
    </label>
    <label>
      Value jump: <output data-value="valueJump">8 bps</output>
      <input type="range" min="1" max="22" step="0.5" value="8" data-param="valueJump">
    </label>
    <label>
      Order cost: <output data-value="orderCost">1 bps</output>
      <input type="range" min="0" max="6" step="0.25" value="1" data-param="orderCost">
    </label>
    <label>
      Inventory risk: <output data-value="inventoryRisk">2 bps</output>
      <input type="range" min="0" max="8" step="0.25" value="2" data-param="inventoryRisk">
    </label>
    <label>
      Noise imbalance: <output data-value="imbalance">+5%</output>
      <input type="range" min="-40" max="40" step="1" value="5" data-param="imbalance">
    </label>
    <label>
      Trades: <output data-value="trades">220</output>
      <input type="range" min="80" max="420" step="10" value="220" data-param="trades">
    </label>
  </div>
  <div class="spread-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="Bid-ask spread decomposition simulator showing half-spread components, Bayesian posteriors, inventory and P&L paths, and spread versus informed flow"></canvas>
  <div class="spread-lab__legend">
    <span><i style="background:#0f766e"></i> Order processing</span>
    <span><i style="background:#be123c"></i> Adverse selection</span>
    <span><i style="background:#b45309"></i> Inventory</span>
    <span><i style="background:#7c3aed"></i> Marked P&L</span>
    <span><i style="background:#64748b"></i> Roll estimate</span>
  </div>
  <p class="spread-lab__note">
    Deterministic toy model. Values are in basis points around a synthetic
    midpoint. "Realized spread" uses a short look-ahead in the simulated tape,
    so it can turn small or negative when adverse selection dominates. The Roll
    estimate is shown only when transaction-price covariance has the sign its
    assumptions require.
  </p>
</div>
<script defer src="{{ '/assets/js/spread-components-lab.js?v=20260613a' | relative_url }}"></script>

The first panel is the accounting ledger: order-processing cost, Bayesian
adverse selection, and an inventory cushion. The second panel is the posterior
belief. If a buy order strongly raises $$P(H)$$, the dealer must raise the ask
before the trade arrives or lose money after it.

The path panel is intentionally noisy. Even a correctly priced spread does not
make every tape profitable. The dealer earns spread from uninformed immediacy
traders and loses to informed traders when the efficient value moves after the
fill. Inventory can help or hurt depending on the sequence. Market making is not
"collecting the spread" in the same way an insurer is not "collecting premiums"
without underwriting risk.

## The Bounce You Can See Without Quotes

Richard Roll noticed a beautiful fingerprint.[^roll] Suppose the efficient
price is a random walk, trades occur at either bid or ask, and the spread is
fixed. Then transaction prices bounce around the efficient value. A buy at the
ask followed by a sell at the bid creates negative serial covariance in price
changes even if the efficient price itself is unpredictable.

Under the model's assumptions, the effective spread can be inferred from

$$
S = 2\sqrt{-\operatorname{Cov}(\Delta P_t,\Delta P_{t-1})}.
$$

This is why the lab reports a Roll estimate. When the simulated transaction
price changes have negative first-order covariance, the estimator sees a bounce.
When information shocks dominate, the covariance can flip sign and the estimator
refuses to speak. That failure is useful. It says the simple bid-ask bounce
story is not the whole data-generating process.

Modern microstructure measurement usually separates at least three quantities:

- quoted spread: the displayed ask minus displayed bid;
- effective spread: how far the execution price is from the midpoint at trade
  time, signed by trade direction;
- realized spread: how much of that execution revenue remains after the
  midpoint has had time to move.

The last quantity is where adverse selection shows its teeth. If a customer
buys and the midpoint quickly rises, the dealer's apparent spread capture was
partly compensation for selling too low. Hasbrouck's VAR approach measures a
trade's information content through eventual quote revisions, and reports that
trade impact arrives with lag and varies with trade size, spread, and firm
characteristics.[^hasbrouck] Madhavan, Richardson, and Roomans similarly model
transaction-level price changes as a mixture of public information, asymmetric
information, inventory, and order-processing effects.[^mrr]

Huang and Stoll's spread-decomposition paper is a useful warning label here:
empirical decomposition is model-dependent. They reconcile existing models in a
time-series framework and find a large order-processing component plus smaller
but significant adverse-selection and inventory components, with estimates
sensitive to trade size and assumptions about how orders relate to trades.[^huangstoll]
The word "component" sounds physical, as if the spread were a sandwich to be
peeled apart. In real data, the layers are inferred through a model.

## What the Midpoint Hides

A backtest often assumes fills at midpoint plus a fixed spread cost. That is a
reasonable first penalty for slow, small, liquid trades. It becomes dangerous
when the strategy itself changes the order-flow state.

If the signal buys immediately before price increases, your fills are not
random draws from the quote. You are more likely to demand liquidity when the
dealer should widen. If the strategy trades names with stale quotes, the
observed spread may understate executable cost. If the strategy leans on a venue
with rebates, queue priority matters: the economics of posting a limit order are
not the economics of crossing the spread. If the strategy repeatedly buys after
the same public event, realized spread and market impact are the relevant
objects, not quoted spread.

The audit I would want for a serious strategy is a little ledger:

1. measured quoted spread at decision time;
2. effective spread paid at execution;
3. midpoint move after 1 second, 10 seconds, 1 minute, and 5 minutes;
4. realized spread by venue, order type, size bucket, and volatility regime;
5. inventory concentration created by the strategy's own flow;
6. performance after replacing midpoint fills with a conditional spread model.

The last step is the important one. Costs should be conditional on the reasons
the strategy trades. A model that pays the same spread when alpha is quiet and
when alpha is screaming is assuming away adverse selection precisely when it
matters most.

## The Unfinished Part

The next useful blog-sized experiment would take public trade-and-quote data and
try to reproduce a decomposition like this at small scale:

```text
quoted spread
effective spread
realized spread
post-trade midpoint response
Roll covariance estimate
simple adverse-selection proxy
```

The hard part would not be the formulas. It would be the boring machinery:
cleaning timestamps, matching trades to quotes, classifying trade direction,
handling locked or crossed markets, filtering odd lots, and deciding which
midpoint horizon counts as "realized." In microstructure, the plumbing is often
the result.

I like this direction because it connects three worlds that are often taught
separately. Bayes explains why the ask is conditional. Control explains why
inventory changes quotes. Time-series econometrics explains how the spread
leaves traces in transaction prices. Put them together and the midpoint stops
looking like a price. It starts looking like a truce.

The spread is the premium paid to trade now, before the market knows whether now
was a harmless convenience or the beginning of a repricing.

## References

[^glosten]: Lawrence R. Glosten and Paul R. Milgrom, ["Bid, ask and transaction prices in a specialist market with heterogeneously informed traders"](https://econpapers.repec.org/article/eeejfinec/v_3a14_3ay_3a1985_3ai_3a1_3ap_3a71-100.htm), *Journal of Financial Economics*, 1985. See also the [Columbia Business School record](https://business.columbia.edu/faculty/research/bid-ask-and-transaction-prices-specialist-market-heterogeneously-informed-traders).

[^hostoll]: Thomas Ho and Hans R. Stoll, ["Optimal dealer pricing under transactions and return uncertainty"](https://econpapers.repec.org/article/eeejfinec/v_3a9_3ay_3a1981_3ai_3a1_3ap_3a47-73.htm), *Journal of Financial Economics*, 1981.

[^kyle]: Albert S. Kyle, ["Continuous Auctions and Insider Trading"](https://econpapers.repec.org/article/ecmemetrp/v_3a53_3ay_3a1985_3ai_3a6_3ap_3a1315-35.htm), *Econometrica*, 1985. The [JSTOR record](https://www.jstor.org/stable/1913210) is also available.

[^roll]: Richard Roll, ["A Simple Implicit Measure of the Effective Bid-Ask Spread in an Efficient Market"](https://authors.library.caltech.edu/records/afwsc-6bb61), *Journal of Finance*, 1984.

[^hasbrouck]: Joel Hasbrouck, ["Measuring the Information Content of Stock Trades"](https://www.econbiz.de/Record/measuring-the-information-content-of-stock-trades-hasbrouck-joel/10005214220), *Journal of Finance*, 1991.

[^mrr]: Ananth Madhavan, Matthew Richardson, and Mark Roomans, ["Why Do Security Prices Change? A Transaction-Level Analysis of NYSE Stocks"](https://www.jstor.org/stable/2962338), *Review of Financial Studies*, 1997. A working-paper PDF is available from [NYU Stern](https://w4.stern.nyu.edu/finance/docs/WP/1996/pdf/wpa96034.pdf).

[^huangstoll]: Roger D. Huang and Hans R. Stoll, ["The Components of the Bid-Ask Spread: A General Approach"](https://academic.oup.com/rfs/article-abstract/10/4/995/1605656), *Review of Financial Studies*, 1997.
