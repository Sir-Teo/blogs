---
layout: post
title: "The Auction Should Tick"
description: "A continuous limit order book can turn public information into a private speed prize. Frequent batch auctions change the question from who arrived first to what price clears."
date: 2026-06-17 09:55:00 -0400
categories: quantitative-finance
series: quantitative-trading
tags: [market-microstructure, frequent-batch-auctions, latency-arbitrage, high-frequency-trading, limit-order-books, market-design, quantitative-finance]
excerpt: "A continuous book asks who arrived first. A frequent batch auction asks what price clears. That one clock change can turn a speed race back into price competition."
---

A market can be electronically fair and still ask a strange question.

Not "what is the security worth?"

Not "who is willing to supply liquidity?"

But:

```text
which message
crossed the matching engine
first?
```

At human scale, that sounds like plumbing. At microsecond scale, it becomes a
business model.

Imagine a public signal moves. Everyone serious sees it. The liquidity provider
with a now-stale quote tries to cancel. Other firms try to hit that stale quote
first. The continuous limit order book processes messages one at a time, so
somebody wins the race. If the cancel is first, the quote disappears. If a take
order is first, the stale quote trades.

The information was public. The rent came from serialization.

This is the central market-design claim in Budish, Cramton, and Shim's frequent
batch auction paper.[^bcs] Continuous-time trading plus serial message
processing can create arbitrage rents from information that is symmetrically
observed. Their proposed response is not to ban speed, tax computers, or pretend
latency can be removed. It is to change the matching clock: collect orders over a
short interval, then run a uniform-price double auction. For concreteness, they
often discuss intervals like 100 milliseconds. The important move is not that
100 ms is sacred. The important move is that requests inside the same tick are
treated as simultaneous.

That changes the question. A continuous book asks: who arrived first? A batch
auction asks: what price clears?

## The Rent Is in the Tie-Break

The continuous limit order book has a clean operational rule:

1. orders arrive;
2. the matching engine processes them in sequence;
3. price-time priority decides what executes.

That rule is wonderfully legible most of the time. A passive order posts at a
price. An aggressive order crosses the spread. Earlier orders at a price stand
ahead of later orders.

But when a public signal jumps, "earlier" becomes a knife-edge. Suppose one
liquidity provider is trying to cancel one stale offer, and eight other firms
are trying to buy it. If everyone has roughly the same technology, the liquidity
provider does not need to be slow to lose. She must beat all eight takers. The
snipers only need one of them to be first.

In the Budish-Cramton-Shim model, this is enough to create a positive cost of
liquidity even without the classic adverse-selection story where one trader has
private information about fundamentals.[^bcs] The public signal is enough
because the market design turns a simultaneous reaction into an ordered race.

The later empirical paper by Aquilina, Budish, and O'Neill is useful because it
looked for the race residue directly: failed attempts to trade or cancel.[^abo]
Ordinary limit-order-book data show the state changes that happened. Message
data can also show failed immediate-or-cancel orders and "too late to cancel"
responses. The failures are the shadow of the race. In their London Stock
Exchange sample, they report about one latency-arbitrage race per minute per
FTSE 100 symbol, modal winner-loser gaps of 5 to 10 microseconds, and race
activity around a fifth of trading volume.[^abo-results]

Those are not the numbers in the toy below. The toy is deliberately smaller. It
is a matching-clock microscope.

## A Small Matching Engine

The lab simulates public price jumps. Each jump leaves an old quote exposed if
the jump is larger than the half-spread. A liquidity provider sends a cancel.
Several snipers send take orders. Latencies are random but centered at the same
scale by default, so the race comes from one canceler competing against many
takers, not from assuming the takers are magic.

There are two matching rules:

**Continuous book.** The first relevant message wins. If the first sniper arrives
before the cancel, the stale quote trades.

**Batch book.** Messages are rounded to clearing ticks. If the cancel and the
first snipe land in the same tick, the stale quote is removed in the batch. If a
snipe lands in an earlier tick than the cancel, the stale quote trades.

This is not a full exchange simulator. There is no queue depth, hidden liquidity,
multi-venue routing, tick-size constraint, inventory control, maker-taker fee,
or strategic equilibrium. The point is narrower: isolate the tie-break.

<style>
  .fba-lab {
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

  .fba-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }

  .fba-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fba-lab output {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .fba-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .fba-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 0 0 1rem;
  }

  .fba-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.7rem 0.75rem;
  }

  .fba-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .fba-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.88rem, 2.5vw, 1.08rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .fba-lab__metric.good strong {
    color: #0f766e;
  }

  .fba-lab__metric.warn strong {
    color: #b45309;
  }

  .fba-lab__metric.bad strong {
    color: #be123c;
  }

  .fba-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .fba-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 640px) {
    .fba-lab {
      padding: 0.75rem;
    }

    .fba-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="fba-lab" data-fba-lab>
  <div class="fba-lab__controls">
    <label>
      Batch interval <output data-value="batchMs">100.00 ms</output>
      <input type="range" data-param="batchMs" min="0.02" max="100" step="0.02" value="100" aria-label="Batch interval">
    </label>
    <label>
      Half-spread <output data-value="halfSpreadBps">2.5 bps</output>
      <input type="range" data-param="halfSpreadBps" min="0.5" max="8" step="0.1" value="2.5" aria-label="Half-spread in basis points">
    </label>
    <label>
      Jump scale <output data-value="jumpBps">7.0 bps</output>
      <input type="range" data-param="jumpBps" min="1" max="20" step="0.1" value="7" aria-label="Public jump scale in basis points">
    </label>
    <label>
      Cancel latency <output data-value="makerUs">180 us</output>
      <input type="range" data-param="makerUs" min="60" max="1500" step="5" value="180" aria-label="Liquidity provider cancel latency">
    </label>
    <label>
      Snipe latency <output data-value="sniperUs">180 us</output>
      <input type="range" data-param="sniperUs" min="20" max="900" step="5" value="180" aria-label="Sniper latency scale">
    </label>
    <label>
      Snipers <output data-value="snipers">8</output>
      <input type="range" data-param="snipers" min="1" max="18" step="1" value="8" aria-label="Number of snipers">
    </label>
    <label>
      Public jumps <output data-value="shockCount">9,000</output>
      <input type="range" data-param="shockCount" min="1000" max="20000" step="500" value="9000" aria-label="Number of simulated public jumps">
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="17" aria-label="Random seed">
    </label>
  </div>
  <div class="fba-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Frequent batch auction simulator showing stale quote races, batch interval sweep, rent ledger, and failed message counts"></canvas>
  <p class="fba-lab__note">
    The Audit tile runs nine deterministic checks: parameter cleanup, rent-ledger
    accounting, batch-versus-continuous ordering, sniper-count sensitivity, and
    the log-spaced batch sweep.
  </p>
</div>

<script defer src="{{ '/assets/js/frequent-batch-auction-lab.js?v=20260617a' | relative_url }}"></script>

With the default settings, 6,255 of the 9,000 public jumps are large enough to
make the old quote vulnerable. In the continuous book, 5,124 of those vulnerable
quotes are picked off. In the 100 ms batch book, 2 are. The remaining 5,122
continuous races collapse into a shared clearing tick.

Do not read that as "100 ms is optimal." Read it as a clock demonstration. The
same 100 microsecond edge is decisive in a continuous race. In a 100 ms batch,
the edge matters only when it crosses a batch boundary. That is the paper's
\(\delta / \tau\) intuition: a tiny speed improvement \(\delta\) is valuable only
in the fraction of cases where it changes the discrete-time ordering inside a
batch interval of length \(\tau\).[^bcs]

The cost is visible too. A trader who wants immediate execution waits, on
average, about half the batch interval. That is why the design question is not
"continuous or slow?" It is "which latency should the market sell?" Continuous
matching sells positional speed. Batch matching sells a little waiting time in
exchange for less positional speed.

## Why the Failed Messages Matter

The prettiest part of the 2022 measurement paper is methodological. If you only
look at trades and book updates, a race often looks like a single clean event.
Someone traded. Someone else canceled. The losers vanish from the public book.

Message data changes that. A failed IOC order says, "I tried to take that quote
and got nothing." A too-late-to-cancel response says, "I tried to remove that
quote and it had already traded." A race is not just a trade. It is a cluster of
successes and failures around the same symbol, side, and price.[^abo-method]

That is why the lab tracks failed messages, even though the failures are toy
failures. They are the residue that distinguishes a speed-sensitive event from a
normal liquidity-taking event.

If a proposed market-design change claims to reduce latency arbitrage, I would
want the audit to look like this:

- race definitions built from message-level successes and failures;
- realized spread for liquidity providers in race and nonrace trades;
- effective-spread and price-impact decomposition with races separated;
- investor execution quality, not only market-maker economics;
- sensitivity to the race horizon, symbol liquidity, tick size, and volatility;
- gaming analysis for the new auction's information policy and tie-break rules.

The 2022 paper estimates that latency-arbitrage races are a meaningful share of
price impact and the effective spread, and that eliminating latency arbitrage
could reduce investors' cost of liquidity by about 17% in their setting.[^abo-results]
That number is not a universal constant. It is evidence that the mechanism is
not merely philosophical.

## Periodic Auctions Are Real, but Not All the Same

There are real-world periodic auction books. Cboe Europe describes its Periodic
Auctions Book as a lit order book running frequent randomized intra-day auctions,
with indicative price and size transparency and an execution model that rewards
size over speed.[^cboe-faq] ESMA examined the growth of such systems after MiFID
II because market participants raised both market-quality and transparency
questions.[^esma]

Those venue designs are not identical to the standalone frequent batch auction
proposal in the QJE paper. Cboe's European periodic auctions, for example, sit in
a fragmented market next to continuous books and use venue-specific collars,
call phases, and allocation rules.[^cboe-fact] That distinction matters. A
mechanism can share the family resemblance while answering a different
regulatory or execution problem.

The implementation-details paper by Budish, Cramton, and Shim is careful about
this too. Once supply and demand cross in the auction, the clearing price and
rationing rule matter; they suggest pro-rata rationing within the marginal batch
interval so that orders inside a batch are treated equally rather than racing for
time priority inside the tick.[^implementation]

That is the phrase to keep: inside the tick. The design is not anti-algorithm. It
is anti-infinitesimal tie-break.

## What the Clock Decides

A continuous market says the smallest measurable arrival difference is
economically meaningful. If one router, microwave path, feed handler, kernel
configuration, FPGA, or colocation cage wins by five microseconds, the matching
engine can turn that difference into a trade.

Sometimes that is exactly what we want. If two investors independently decide to
pay the same price, time priority is a natural rationing rule. It rewards
standing liquidity and makes the book legible.

But stale-quote races after public signals are not ordinary queue discipline.
They are a conversion of common knowledge into private rent. That is a strange
thing for a market to manufacture.

The batch clock does not remove latency. It rounds it. It says: below this
resolution, the market will not sell priority. Compete on price, quantity, and
risk-bearing instead.

That is why this topic belongs halfway between finance and computer science.
The interesting object is not only the order book. It is the scheduler.

[^bcs]: Eric Budish, Peter Cramton, and John Shim, ["The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response"](https://academic.oup.com/qje/article/130/4/1547/1916146), *Quarterly Journal of Economics*, 2015.

[^abo]: Matteo Aquilina, Eric Budish, and Peter O'Neill, ["Quantifying the High-Frequency Trading Arms Race"](https://academic.oup.com/qje/article/137/1/493/6368348), *Quarterly Journal of Economics*, 2022.

[^abo-results]: Aquilina, Budish, and O'Neill report about one race per minute per FTSE 100 symbol, modal winner-loser gaps of 5 to 10 microseconds, roughly 20% of trading volume in races, a latency-arbitrage tax around 0.5 basis points, and an estimated 17% reduction in liquidity cost under designs that eliminate latency arbitrage.

[^abo-method]: See Section III of Aquilina, Budish, and O'Neill for the race definition based on same symbol, price, and side; mixed take/cancel or all-take attempts; and both successes and failures.

[^cboe-faq]: Cboe Europe, ["Periodic Auctions Book FAQ"](https://cdn.cboe.com/resources/participant_resources/Cboe_EE_PeriodicAuctionsFAQ.pdf), 2020.

[^esma]: ESMA, ["ESMA launches call for evidence on periodic auctions for equity instruments"](https://www.esma.europa.eu/press-news/esma-news/esma-launches-call-evidence-periodic-auctions-equity-instruments), 9 November 2018.

[^cboe-fact]: Cboe Europe, ["Periodic Auctions Book: Lit Book Dedicated to Intra-Day Auctions"](https://cdn.cboe.com/resources/participant_resources/BATSEuro_PeriodicAuctions.pdf), 2020.

[^implementation]: Eric Budish, Peter Cramton, and John Shim, ["Implementation Details for Frequent Batch Auctions: Slowing Down Markets to the Blink of an Eye"](https://www.econ.umd.edu/sites/www.econ.umd.edu/files/pubs/budish-cramton-shim-frequent-batch-auctions-aerpp.pdf), *American Economic Review Papers and Proceedings*, 2014.
