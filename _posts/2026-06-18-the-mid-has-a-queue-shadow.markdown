---
layout: post
title: "The Mid Has a Queue Shadow"
description: "The midprice ignores how much size is waiting at the best bid and ask. A one-step microprice treats the next quote move as a queue-depletion race."
date: 2026-06-18 02:10:00 -0400
categories: quantitative-finance
tags: [market-microstructure, limit-order-books, microprice, queue-imbalance, quantitative-finance]
excerpt: "The displayed mid is symmetric in price, not in state. Queue imbalance is a small forecast about which quote is more likely to vanish first."
---

The displayed midprice is a clean number with a dirty omission.

```text
bid  100.00   30 lots
ask  100.01   26 lots
mid  100.005
```

The mid says the quotes are one tick apart. It does not say that the bid queue
is a little thicker than the ask queue. If the ask is more likely to disappear
first, the next mid is more likely to tick up than down.

That missing state is the queue shadow.

## From Mid To Microprice

For a one-tick spread, write the current mid as `0`, the bid as `-0.5` ticks,
and the ask as `+0.5` ticks. If the ask queue depletes first, the next mid moves
up by half a tick. If the bid queue depletes first, the next mid moves down by
half a tick.

So a one-step expected mid is:

$$
E[\Delta M]
=
\frac{1}{2}P(\text{ask depletes first})
-
\frac{1}{2}P(\text{bid depletes first}).
$$

Equivalently:

$$
E[\Delta M] = P(\text{uptick}) - \frac{1}{2}
$$

in ticks.

This is not yet Sasha Stoikov's full micro-price construction, which defines a
limit of expected mid-prices conditional on order-book information.[^stoikov]
It is the smallest useful version of the same idea: replace the mid with a
conditional expectation that looks at the book, not only at the quote endpoints.

## The Race Model

The lab below uses a deliberately small best-quote race.

- The ask queue loses one unit when a buy market order or ask cancellation
  removes displayed ask size.
- The bid queue loses one unit when a sell market order or bid cancellation
  removes displayed bid size.
- The first queue to hit zero determines the next mid-price direction.

Let `p` be the probability that the next unit-depletion event hits the ask side.
With ask depth `A` and bid depth `B`, the exact uptick probability is the dynamic
program:

$$
u(a,b) = p\,u(a-1,b) + (1-p)\,u(a,b-1),
$$

with boundary conditions:

$$
u(0,b)=1,\qquad u(a,0)=0.
$$

This is a pure-death cartoon of the richer queueing models studied by Cont,
Stoikov, and Talreja, and by Cont and de Larrard.[^cont-stoikov-talreja][^cont-delarrard]
It ignores arrivals behind the best quotes, hidden liquidity, discrete trade
sizes, queue priority, latency, and strategic reaction. That is a feature here:
the point is to isolate how visible size and flow skew become an expected
mid-price adjustment.

<style>
  .micro-lab {
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
  .micro-lab * {
    box-sizing: border-box;
  }
  .micro-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .micro-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
  }
  .micro-lab output {
    color: #172026;
    font-weight: 800;
  }
  .micro-lab input[type="range"] {
    width: 100%;
  }
  .micro-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 0.9rem 0;
  }
  .micro-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.65rem;
  }
  .micro-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.15;
  }
  .micro-lab__metric strong {
    color: #172026;
    display: block;
    font-size: clamp(0.9rem, 1.25vw, 1.12rem);
    line-height: 1.2;
    margin-top: 0.22rem;
  }
  .micro-lab__metric--good strong {
    color: #0f766e;
  }
  .micro-lab__metric--bad strong {
    color: #be123c;
  }
  .micro-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .micro-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    font-size: 0.78rem;
    font-weight: 650;
    margin-top: 0.7rem;
  }
  .micro-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.32rem;
  }
  .micro-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .micro-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 760px) {
    .micro-lab__controls,
    .micro-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

<div class="micro-lab" data-microprice-queue-lab>
  <div class="micro-lab__controls">
    <label>
      Bid depth <output data-value="bid">30</output>
      <input type="range" data-param="bid" min="1" max="90" step="1" value="30" aria-label="Best bid depth">
    </label>
    <label>
      Ask depth <output data-value="ask">26</output>
      <input type="range" data-param="ask" min="1" max="90" step="1" value="26" aria-label="Best ask depth">
    </label>
    <label>
      Flow skew <output data-value="pressure">+0%</output>
      <input type="range" data-param="pressure" min="-80" max="80" step="1" value="0" aria-label="Ask-depletion flow skew">
    </label>
    <label>
      Trials <output data-value="trials">5,000</output>
      <input type="range" data-param="trials" min="500" max="12000" step="500" value="5000" aria-label="Monte Carlo trials">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="29" aria-label="Random seed">
    </label>
  </div>
  <div class="micro-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Microprice queue imbalance lab showing best bid and ask queues, depletion race, exact probability, weighted mid, and Monte Carlo audit"></canvas>
  <div class="micro-lab__legend">
    <span><i style="background:#2563eb"></i>Bid queue</span>
    <span><i style="background:#be123c"></i>Ask queue</span>
    <span><i style="background:#0f766e"></i>Race microprice</span>
    <span><i style="background:#7c3aed"></i>Weighted mid</span>
  </div>
  <p class="micro-lab__note" data-note>
    Bid depth 30, ask depth 26, flow skew +0%. Exact race microprice is +0.205 ticks; weighted-mid shortcut is +0.036 ticks.
  </p>
</div>

<script defer src="{{ '/assets/js/microprice-queue-lab.js?v=20260618c' | relative_url }}"></script>

## The Default Run

For the default `30 x 26` best-quote race with symmetric depletion flow, the
audited run reports:

| Quantity | Value |
| --- | ---: |
| exact uptick probability | `70.5%` |
| Monte Carlo uptick rate | `70.4%` |
| race-implied microprice | `+0.205` ticks |
| weighted-mid shortcut | `+0.036` ticks |
| mean events until quote move | `49.2` |
| sample-path quote move | ask depleted first after `48` events |

The weighted-mid shortcut is:

$$
\frac{A_{\text{price}}B_{\text{size}} + B_{\text{price}}A_{\text{size}}}
     {A_{\text{size}} + B_{\text{size}}}.
$$

Inside a one-tick spread, relative to the mid, that becomes:

$$
\frac{(+1/2)B + (-1/2)A}{A+B}
=
\frac{1}{2}\frac{B-A}{A+B}.
$$

In tick units around the mid, the lab uses `0.5 * (B - A) / (A + B)`.

That shortcut is monotone in imbalance, which is useful. But it is not the exact
first-depletion probability of this race. The exact value knows how many
same-side events must arrive before the other side finishes.

## Why A Small Queue Advantage Can Be Large

With symmetric unit-depletion flow, the event sequence is a sequence of fair
coin flips labeled "ask hit" and "bid hit." If the ask starts at `26` and the bid
starts at `30`, an uptick happens when the sequence records `26` ask hits before
it records `30` bid hits.

That is easier than the raw size difference suggests. The ask does not need to
be hit more often than the bid forever. It only needs to finish first.

This is why queue imbalance is not a linear ruler. Near the boundary, a small
visible-depth advantage can correspond to a much larger first-passage
probability.

Move **Flow skew** away from zero and the message changes again. A heavy bid
queue is not bullish if the next depletion events are much more likely to hit
the bid. Size and flow are separate state variables. A microprice model has to
say how both enter.

## Evidence Versus Interpretation

The evidence in this post is only about the toy model:

- exact dynamic programming and seeded Monte Carlo agree on the first-depletion
  probability;
- the next-mid expectation can differ sharply from the weighted-mid shortcut;
- queue imbalance matters because price moves are modeled as queue depletions.

The interpretation is broader but weaker: visible imbalance is a plausible
short-horizon signal because the best quotes are queues, not decorative labels.
The market-microstructure literature gives much richer versions of that idea.
Cont and de Larrard's Markovian model, for example, computes the probability of
an upward price move conditional on the order-book state.[^cont-delarrard]
Stoikov's micro-price paper defines a fair price conditional on book
information, expressible as an adjustment to the midprice using spread and
imbalance.[^stoikov]

Real markets add everything the lab leaves out: replenishment, queue priority,
large orders, hidden size, adverse selection, latency, correlated order flow,
and trader reaction. Gould et al.'s survey is a useful antidote to over-trusting
any single stylized limit-order-book model.[^gould]

To reproduce the deterministic audit sweep from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/microprice-queue-lab.js");
const EXPECTED_CASES = 5;
const EXPECTED_CHECKS = 45;

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
console.table(audit.byCase);
console.table(audit.cases.map((row) => ({
  case: row.caseId,
  bid: row.bid,
  ask: row.ask,
  pressure: row.pressure,
  exactUp: (100 * row.exactUp).toFixed(1) + "%",
  simulatedUp: (100 * row.simulatedUp).toFixed(1) + "%",
  mcError: row.monteCarloError.toFixed(4),
  raceTicks: row.raceMicroTicks.toFixed(3),
  weightedTicks: row.weightedTicks.toFixed(3),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
if (audit.total !== EXPECTED_CASES || audit.totalChecks !== EXPECTED_CHECKS) {
  throw new Error(
    `unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`
  );
}
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    failed,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(summary);
NODE
```

The current sweep covers five queue states and 45 named checks. It verifies
bounded exact probabilities, spread-bounded microprices, Monte Carlo agreement
with the dynamic program, sample-path quote depletion, balanced-book symmetry,
depth monotonicity under symmetric flow, pressure tilt, and the one-row-per-split
curve shape used in the visualization.

## Boundaries

This lab is not a trading signal and not a claim about expected profit. It is a
small accounting identity under a stated race model.

A production estimate would need at least:

1. learned state-dependent depletion and refill intensities;
2. multiple price levels, not only the best quotes;
3. latency-aware queue position and cancellation modeling;
4. out-of-sample markout tests after fees, spread, and impact;
5. calibration checks by symbol, time of day, volatility, and regime.

The useful lesson is narrower:

```text
midprice = quote geometry
microprice = quote geometry plus a model of the next state
```

The mid is centered between prices. The microprice is centered between possible
futures.

## Sources

[^stoikov]: Sasha Stoikov, ["The Micro-Price: A High Frequency Estimator of Future Prices"](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2970694), SSRN, 2017; revised 2020.

[^cont-stoikov-talreja]: Rama Cont, Sasha Stoikov, and Rishi Talreja, ["A Stochastic Model for Order Book Dynamics"](https://www.columbia.edu/~ww2040/orderbook.pdf), *Operations Research* 58(3), 549-563, 2010. DOI record: [10.1287/opre.1090.0780](https://doi.org/10.1287/opre.1090.0780).

[^cont-delarrard]: Rama Cont and Adrien de Larrard, ["Price Dynamics in a Markovian Limit Order Market"](https://arxiv.org/abs/1104.4596), arXiv:1104.4596; *SIAM Journal on Financial Mathematics* 4(1), 1-25, 2013.

[^gould]: Martin D. Gould, Mason A. Porter, Stacy Williams, Mark McDonald, Daniel J. Fenn, and Sam D. Howison, ["Limit Order Books"](https://arxiv.org/abs/1012.0349), arXiv:1012.0349, 2010; revised 2013.
