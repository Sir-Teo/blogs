---
layout: post
title: "The Queue Position Is an Option"
description: "In a limit order book, two orders at the same price are not the same trade. FIFO priority changes fill probability, adverse selection, and the option value of waiting."
date: 2026-06-14 00:08:00 -0400
categories: quantitative-finance
tags: [market-microstructure, limit-order-books, queue-position, adverse-selection, execution, quantitative-finance]
excerpt: "A passive order at the best bid is not just a cheaper market order. It is a contingent claim: it executes only if enough future flow reaches your place in the queue before the quote moves away."
---

The best bid is a price.

The queue behind the best bid is a calendar.

That distinction is easy to lose because a limit order book is usually drawn as
a ladder of prices and sizes:

```text
ask  100.01   8,400 shares
bid  100.00  11,700 shares
```

The display says nothing about where your order sits inside the 11,700 shares.
If the market has price-time priority, that hidden coordinate matters. An order
at the front of the bid queue and an order at the back of the bid queue have the
same displayed price, but they are not the same economic object.

The front order is exposed to ordinary sell market orders. The back order is
mostly exposed to large or persistent sell waves. That is already a selection
effect. Bad queue position does not only reduce fill probability. It changes
which states of the world are allowed to fill you.

This is why queue position is an option, but not a friendly one. You have the
right to trade at the bid if the future path of the book reaches you. The path
that reaches you is informative.

## The Ticket

Suppose you place a one-unit buy limit order at the best bid. Let

$$
N_t
$$

be the amount of bid quantity ahead of you, and let

$$
A_t
$$

be the amount sitting at the best ask. You fill when market sells and
cancellations reduce $$N_t$$ to zero and the next sell market order reaches your
ticket. You miss the current quote if the ask side disappears first and the mid
price ticks up.

So the fill event is not:

```text
price touched my limit
```

It is closer to:

```text
my side of the book was consumed in the right order before the other side moved
```

That is a queueing problem. Cont, Stoikov, and Talreja made this analogy
explicit by modeling limit order book dynamics as a continuous-time Markov
process over queue sizes at price levels.[^cont-stoikov-talreja] Cont and de
Larrard later studied a simpler Markovian limit order market where price changes
are generated endogenously by depletion of the best bid or ask queues.[^cont-delarrard]
The queue-reactive model of Huang, Lehalle, and Rosenbaum pushes the same idea
toward richer empirical simulation: order-flow intensities depend on the
current state of the book.[^queue-reactive]

Those models are not saying markets are literally memoryless machines. They are
saying something more useful for thinking: over short horizons, a surprising
amount of execution risk can be represented by which queue depletes first.

For a passive buy order, the basic payoff decomposition is:

$$
\text{value}
=
P(\text{fill})\,
E\left[M_{\tau+h}-P_{\text{bid}} \mid \text{fill}\right],
$$

where $$\tau$$ is the fill time, $$M_{\tau+h}$$ is a future mid price, and
$$P_{\text{bid}}$$ is the bid price you paid. If the future mid stays near the
old midpoint, the fill earns roughly half the spread. If the mid moves down
after you buy, the spread was a coupon attached to a losing state.

The conditioning is the dangerous part. A fill is evidence.

## The Back of the Queue Is a Filter

Imagine there are 100 units ahead of you. A one-unit sell market order does not
touch you. A two-unit sell market order does not touch you. A normal drizzle of
small orders may move you forward, but it may also end before you trade. To get
filled quickly from the back, you often need a large market order, a burst of
cancellations, or a persistent directional wave.

That is why the back of the queue can be worse in two ways:

1. You wait longer and fill less often.
2. Conditional on filling, you are more likely to have traded with a state that
   was strong enough to eat the whole queue.

Moallemi and Yuan make this point directly in their model of queue-position
valuation. They identify a static component, tied to spread earned versus
adverse-selection cost at execution, and a dynamic component, tied to the value
of moving forward in the queue as trades and cancellations occur.[^moallemi-yuan]
Their empirical message is also sharp: in some large-tick assets, queue value
can be on the order of the bid-ask spread itself.

That should not be shocking. When the tick is economically large and the spread
is often one tick, traders cannot cheaply jump in front by improving the price.
Priority becomes the scarce asset. The market competes in time because it cannot
smoothly compete in price.

Parlour's dynamic limit order market is an early equilibrium version of the same
intuition: order placement depends on the state of the book, and execution
probability is endogenous.[^parlour] Glosten's electronic open limit order book
model also shows how adverse selection is built into the price schedule supplied
by limit orders.[^glosten] Queue priority is where that price schedule becomes
operational.

## The Cancel Button Is Part of the Instrument

The option analogy becomes clearer once you allow cancellation.

A resting order is not simply a promise to trade. It is a promise you may try to
withdraw before the bad state arrives. If the bid queue becomes thin, the ask is
heavy, and sell pressure accelerates, a fast participant may cancel and reinsert
elsewhere. A slow participant may discover the signal only after being filled.

Lehalle and Mounjid study this exact tension: limit order placement trades off
fast execution against adverse selection, and the value of using order-book
imbalance is eroded by latency because prediction is less useful if you cannot
cancel and reinsert in time.[^lehalle-mounjid]

That is not a moral statement about speed. It is a mechanical statement about
the payoff. A stale resting order sells optionality to faster information.

## A Queue-Position Lab

The lab below simulates one passive buy order at the best bid. It is deliberately
small, but it keeps the three ingredients that matter for the essay:

- FIFO queue position at the best bid;
- stochastic best-bid and best-ask depletion;
- persistent order-flow pressure, so fills can be informative.

The simulation tracks whether the order fills, misses an uptick, gets pulled, or
times out. If it fills, the lab continues the book for a short markout window and
marks the position to the future mid.

It is not a trading system. It is a microscope for the conditional event
"I got filled."

<style>
  .queue-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .queue-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .queue-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .queue-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .queue-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .queue-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .queue-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .queue-lab__metric span,
  .queue-lab__note,
  .queue-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .queue-lab__metric span {
    display: block;
  }

  .queue-lab__metric strong {
    display: block;
    font-size: 1.03rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .queue-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .queue-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.85rem;
    margin-top: 0.7rem;
  }

  .queue-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
  }

  .queue-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .queue-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="queue-lab" data-queue-position-lab>
  <div class="queue-lab__controls">
    <label>
      Queue position: <output data-value="position">65%</output>
      <input type="range" min="0" max="100" step="1" value="65" data-param="position">
    </label>
    <label>
      Bid queue size: <output data-value="bidDepth">80 units</output>
      <input type="range" min="12" max="180" step="1" value="80" data-param="bidDepth">
    </label>
    <label>
      Ask queue size: <output data-value="askDepth">70 units</output>
      <input type="range" min="12" max="180" step="1" value="70" data-param="askDepth">
    </label>
    <label>
      Order-flow toxicity: <output data-value="toxicity">62%</output>
      <input type="range" min="0" max="100" step="1" value="62" data-param="toxicity">
    </label>
    <label>
      Cancellation rate: <output data-value="cancelRate">32%</output>
      <input type="range" min="0" max="70" step="1" value="32" data-param="cancelRate">
    </label>
    <label>
      Pull speed: <output data-value="pullSpeed">20%</output>
      <input type="range" min="0" max="90" step="1" value="20" data-param="pullSpeed">
    </label>
    <label>
      Horizon: <output data-value="horizon">120 events</output>
      <input type="range" min="30" max="240" step="5" value="120" data-param="horizon">
    </label>
  </div>
  <div class="queue-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Queue position simulator showing value curves, fill outcomes, adverse selection probability, and one order life"></canvas>
  <div class="queue-lab__legend">
    <span><i style="background:#0f766e"></i> Fill or bid queue</span>
    <span><i style="background:#be123c"></i> Adverse fill</span>
    <span><i style="background:#d97706"></i> Missed uptick</span>
    <span><i style="background:#7c3aed"></i> Maker markout</span>
    <span><i style="background:#64748b"></i> Post-vs-cross edge</span>
  </div>
  <p class="queue-lab__note">
    Deterministic Monte Carlo toy model. Market-order bursts consume multiple
    queue units when order-flow pressure is persistent. "Maker value" is future
    mid minus bid fill price, counted as zero if the order never fills.
    "Post vs cross" is the tick advantage of posting instead of immediately
    crossing, with missed upticks treated as opportunity cost.
  </p>
</div>
<script defer src="{{ '/assets/js/queue-position-lab.js?v=20260614a' | relative_url }}"></script>

Start with the queue position near the back and raise **Order-flow toxicity**.
The fill probability may remain respectable, but the red adverse-fill share
climbs. Now increase **Pull speed**. The red share falls, but some fills turn
into blue "pulled" outcomes. That is the option being exercised: you give up
some spread capture to avoid stale execution.

The most important panel is the value curve. It separates two questions that
are often mashed together:

```text
Do I get filled?
What did the fill mean?
```

The first is a queueing statistic. The second is an information statistic.
Queue position links them.

## Why a Fill Is Not a Fill

Execution data often arrives as rows:

```text
timestamp, side, price, size, venue
```

That is not enough to understand a passive order. For a queue-aware backtest,
you need at least:

- your estimated position in the queue when the order became resting;
- trades and cancellations ahead of you;
- displayed and hidden depth changes;
- whether cancels happened ahead of or behind you;
- the state of the opposite queue;
- the short-horizon markout after fills and after missed fills.

This is where many naive simulations cheat. They assume that if the trade price
touches your limit, you filled. That can turn a difficult execution problem into
a fantasy generator. Touching the price is not the same as reaching your ticket.

The reverse mistake is also common: treating all non-fills as neutral. If you
posted a buy order, the price moved up, and you still needed to buy, the non-fill
was not neutral. It was an opportunity cost. A passive order can save the spread
when it fills and lose the spread, plus more, when the market runs away.

## Two Diagnostics I Would Actually Want

If I were auditing a passive execution model, I would start with two plots.

First, bucket orders by predicted queue position and plot realized fill
probability. The front should fill more often and faster, all else equal. If the
curve is flat, the simulator probably does not understand FIFO priority.

Second, bucket by predicted queue position and plot markout conditional on fill.
If the back of the queue has the same markout as the front, be suspicious. It may
happen in a benign sample, but structurally the back should be more exposed to
large liquidity-consuming waves. The empirical curve does not have to be
monotone every day. The model should at least know why it might be.

Those two diagnostics separate the mechanical queue from the informational
filter. A model that only predicts fill probability can still route orders into
toxic fills. A model that only predicts short-term price moves can still miss
the practical question of whether you are likely to trade before the signal is
gone.

## The Research Direction

The hard version of this problem is not the toy model above. It is inference.

Real queue position is partially observed. Market data tells you displayed
updates, but not every hidden order, matching-engine detail, self-match
prevention rule, exchange-specific priority feature, or cancel that happened
ahead of you. A serious system needs a survival model for your order:

$$
P(\tau_{\text{fill}} \le t \mid \mathcal{F}_t, \widehat{N}_0),
$$

where $$\widehat{N}_0$$ is your estimated initial queue position and
$$\mathcal{F}_t$$ is the event history you observed. Then it needs a conditional
markout model:

$$
E[M_{\tau+h}-P_{\text{fill}} \mid \tau_{\text{fill}}=\tau,\mathcal{F}_\tau].
$$

The product of those two objects is closer to the real value of the order than
either one alone.

That suggests a useful research program:

- estimate queue survival with explicit uncertainty over hidden depth and
  cancellations ahead;
- model conditional markouts by queue position, imbalance, and liquidity-taking
  burst shape;
- evaluate policies by realized implementation shortfall, not by fill rate;
- report the value of queue priority in ticks so the strategy can compare it to
  fees, rebates, latency spend, and price improvement.

The point is not that every trader should obsess over microseconds. The point is
that a limit order is not a static price instruction. It is a contingent object
inside a queueing system.

Two orders can quote the same bid.

Only one owns the earlier future.

## Notes

[^cont-stoikov-talreja]: Rama Cont, Sasha Stoikov, and Rishi Talreja, "A Stochastic Model for Order Book Dynamics," *Operations Research*, 2010. [PDF](https://www.columbia.edu/~ww2040/orderbook.pdf), [INFORMS](https://pubsonline.informs.org/doi/10.1287/opre.1090.0780).

[^cont-delarrard]: Rama Cont and Adrien de Larrard, "Price Dynamics in a Markovian Limit Order Market," *SIAM Journal on Financial Mathematics*, 2013. [arXiv](https://arxiv.org/abs/1104.4596), [SIAM](https://epubs.siam.org/doi/10.1137/110856605).

[^queue-reactive]: Weibing Huang, Charles-Albert Lehalle, and Mathieu Rosenbaum, "Simulating and Analyzing Order Book Data: The Queue-Reactive Model," *Journal of the American Statistical Association*, 2015. [arXiv](https://arxiv.org/abs/1312.0563), [RePEc](https://ideas.repec.org/a/taf/jnlasa/v110y2015i509p107-122.html).

[^moallemi-yuan]: Ciamac C. Moallemi and Kai Yuan, "A Model for Queue Position Valuation in a Limit Order Book," initial version 2016, revised 2017. [PDF](https://moallemi.com/ciamac/papers/queue-value-2016.pdf), [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2996221).

[^parlour]: Christine A. Parlour, "Price Dynamics in Limit Order Markets," *The Review of Financial Studies*, 1998. [Oxford Academic](https://academic.oup.com/rfs/article-abstract/11/4/789/1578190).

[^glosten]: Lawrence R. Glosten, "Is the Electronic Open Limit Order Book Inevitable?", *The Journal of Finance*, 1994. [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.1994.tb02450.x), [RePEc](https://ideas.repec.org/a/bla/jfinan/v49y1994i4p1127-61.html).

[^lehalle-mounjid]: Charles-Albert Lehalle and Othmane Mounjid, "Limit Order Strategic Placement with Adverse Selection Risk and the Role of Latency," arXiv, 2018. [arXiv](https://arxiv.org/abs/1610.00261).
