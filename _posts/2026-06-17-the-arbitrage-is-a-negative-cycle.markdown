---
layout: post
title: "The Arbitrage Is a Negative Cycle"
description: "Currency arbitrage becomes a graph problem after one logarithm. Multiplicative exchange rates turn into additive path weights, and a profitable round trip is exactly a negative cycle."
date: 2026-06-17 03:25:00 -0400
categories: quantitative-finance
tags: [arbitrage, bellman-ford, graph-algorithms, foreign-exchange, quantitative-finance, negative-cycles]
excerpt: "If a round trip multiplies money by more than one, its negative-log weights add to less than zero."
---

A price sheet can lie without any single quote looking absurd.

```text
USD -> EUR
EUR -> JPY
JPY -> USD
```

Each quote can be plausible. Each dealer can be showing something close to the
market. The contradiction only appears when you walk around the loop and come
back with more dollars than you started with.

That is the pleasant part of triangular arbitrage:

```text
profit is a cycle property
```

Not an edge property. Not a pair property. A cycle property.

The algorithmic trick is to make the cycle additive.

## Multiplication Is the Wrong Geometry

Suppose an executable exchange rate from currency \(i\) to currency \(j\) is
\(r_{ij}\). If a cycle uses edges:

```text
i0 -> i1 -> i2 -> ... -> ik -> i0
```

then one unit of the starting currency becomes:

\[
\prod_{\ell=0}^{k} r_{i_\ell i_{\ell+1}}.
\]

There is arbitrage if that product is greater than one, after transaction costs,
spread, fees, market impact, and whatever fill assumptions you are willing to
defend:

\[
\prod r > 1.
\]

Shortest-path algorithms do not want products. They want sums.

So take logs:

\[
\log \prod r = \sum \log r.
\]

Then negate them:

\[
w_{ij} = -\log r_{ij}.
\]

Now a profitable currency loop is exactly:

\[
\sum w_{ij} < 0.
\]

That is a negative cycle.

## Why Bellman-Ford Shows Up

Dijkstra's algorithm is fast because it assumes that once a vertex is settled,
future paths cannot make it cheaper. Negative edges break that proof. A large
exchange rate gives a negative \(-\log r\), so a currency graph naturally lives
in the awkward regime.

Bellman-Ford is slower but less delicate. It repeatedly relaxes every edge. The
dynamic-programming invariant is simple: after \(m\) passes, the distance label
has seen all paths with at most \(m\) edges. Princeton's shortest-path notes use
the same relaxation framing and give the classic arbitrage example: convert
dollars through francs and euros and ask whether a negative-cost cycle exists.[^princeton]

The historical roots are older than the finance application. Ford's 1956 RAND
paper is one of the original shortest-path/network-flow sources.[^ford] Bellman's
1958 routing paper put the dynamic-programming form into the literature.[^bellman]

The final pass is the detector. With \(V\) vertices, a simple path has at most
\(V-1\) edges. If an edge still relaxes on pass \(V\), some cycle is making the
path cheaper. If that cycle is reachable from the artificial source, it is a
negative cycle.

For currencies, that means:

```text
keep trading the loop and the log cost keeps falling
```

Of course, real markets do not let you spin a free loop forever. The point is
not infinite money. The point is an inconsistency in the executable sheet.

## The Lab

The lab below builds a six-currency quote sheet from a latent arbitrage-free
price vector, subtracts trading costs, and then optionally injects a stale quote
gap around one cycle. It then runs two detectors:

```text
Bellman-Ford negative-cycle check
brute-force enumeration of simple cycles
```

The brute-force path is only there as an audit. For six currencies it is cheap.
For a larger graph, you would not enumerate everything in the hot path.

<style>
  .fx-cycle-lab {
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

  .fx-cycle-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .fx-cycle-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fx-cycle-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .fx-cycle-lab select,
  .fx-cycle-lab input[type="range"] {
    accent-color: #be123c;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .fx-cycle-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .fx-cycle-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 1rem;
  }

  .fx-cycle-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.68rem 0.72rem;
  }

  .fx-cycle-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .fx-cycle-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.84rem, 2.35vw, 1.04rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .fx-cycle-lab__metric.good strong {
    color: #0f766e;
  }

  .fx-cycle-lab__metric.bad strong {
    color: #be123c;
  }

  .fx-cycle-lab__metric.warn strong {
    color: #d97706;
  }

  .fx-cycle-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .fx-cycle-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .fx-cycle-lab {
      padding: 0.75rem;
    }

    .fx-cycle-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="fx-negative-cycle-lab" class="fx-cycle-lab" data-fx-negative-cycle-lab>
  <div class="fx-cycle-lab__controls">
    <label>
      Quote sheet
      <select data-param="scenario" aria-label="FX quote sheet scenario">
        <option value="staleCross" selected>stale cross quote</option>
        <option value="clean">arbitrage-free sheet</option>
        <option value="dealerGap">dealer gap</option>
        <option value="fundingLoop">four-leg funding loop</option>
      </select>
      <span data-value="scenario">stale cross quote</span>
    </label>
    <label>
      Quote gap
      <input type="range" min="0" max="120" step="1" value="42" data-param="gapBps" aria-label="Injected quote gap in basis points">
      <span data-value="gapBps">42 bps</span>
    </label>
    <label>
      Trade cost
      <input type="range" min="0" max="40" step="1" value="6" data-param="costBps" aria-label="Per-leg trade cost in basis points">
      <span data-value="costBps">6 bps</span>
    </label>
    <label>
      Size impact
      <input type="range" min="0" max="30" step="1" value="3" data-param="impactBps" aria-label="Additional impact in basis points">
      <span data-value="impactBps">3 bps</span>
    </label>
    <label>
      Start size
      <input type="range" min="1000" max="1000000" step="1000" value="10000" data-param="size" aria-label="Starting notional in dollars">
      <span data-value="size">$10.0k</span>
    </label>
    <label>
      Seed
      <input type="range" min="1" max="9999" step="1" value="37" data-param="seed" aria-label="Random seed">
      <span data-value="seed">37</span>
    </label>
  </div>
  <div class="fx-cycle-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="720" aria-label="FX arbitrage lab showing currency graph, round-trip ledger, Bellman-Ford relaxation, and quote-gap threshold"></canvas>
  <p class="fx-cycle-lab__note">
    Toy executable quote sheet, not a trading system. It ignores queue position,
    rejected fills, credit limits, last-look, settlement risk, inventory, and
    venue-specific latency. The audit checks the graph identity, detector, and
    analytic quote-gap threshold, not market feasibility.
  </p>
</div>

<script defer src="{{ '/assets/js/fx-negative-cycle-lab.js?v=20260617c' | relative_url }}"></script>

With the default settings, the best cycle is:

```text
USD -> EUR -> JPY -> USD
```

The executable product is about `1.001665`, or roughly `16.65` basis points
before any risks outside the toy model. Starting with `$10,000`, that is about
`$16.65` in modeled profit. The named loop's displayed break-even gap is about
`25.4` basis points: below that, its own costs damp the injected quote gap.

Move **trade cost** upward and the red loop disappears. Move **quote gap**
downward and it disappears too. Switch to **arbitrage-free sheet** and the gap
control no longer injects inconsistency; every round trip loses because each
edge pays spread and impact.

The interesting part is not that the default loop is profitable.

The interesting part is that the detector does not care whether the loop has
three legs or four. Bellman-Ford only asks whether relaxation can continue after
all simple paths should have been exhausted.

## A Negative Cycle Is a Certificate

If the detector says "arbitrage", it should hand you a certificate:

```text
the ordered cycle
the executable rate on each leg
the sum of -log rates
the product of rates
the assumed costs and quote gaps
```

The lab's round-trip ledger is that certificate.

The two tests are the same test in different coordinates:

```text
product of rates > 1
sum of negative logs < 0
```

The second one is friendlier to graph algorithms. The first one is friendlier
to a trading desk. They must agree.

The Node audit enforces that identity with:

```text
product == exp(-sum_weight)
```

up to floating-point tolerance.

## The Spread Is Not Decoration

The clean price vector in the lab is internally consistent. If there were no
costs, every round trip would multiply to exactly one:

```text
USD -> EUR -> JPY -> USD = 1
```

The moment you subtract spread and impact from each executable edge, every loop
should lose. That is not a bug. It is the market's friction written into graph
weights.

This is why apparent arbitrage on midpoint data is usually fake. A midpoint
cycle can look positive while the executable bid/ask cycle is negative. A real
detector has to use the side of the book you can actually hit:

```text
sell at bid
buy at ask
pay fees
cross venues
fit within depth
arrive before the quotes move
```

Akram, Rime, and Sarno's high-frequency foreign-exchange study is useful here
because it is not content with daily data. Their tick-level work finds that
short-lived arbitrage opportunities do occur, but they are small, fleeting, and
need contemporaneous executable quotes plus transaction costs to be measured
honestly.[^akram-ideas] Their VoxEU summary reports that such opportunities are
usually eliminated in less than five minutes, and that some returns are only a
few pips.[^akram-cepr]

That is the right scale for this mental model:

```text
not a magic money machine
a consistency alarm with a half-life
```

## Why the Last Pass Matters

Bellman-Ford's first \(V-1\) passes have a simple interpretation:

```text
after pass m, every path with at most m edges has had a chance
```

If the graph has no negative cycles, the best simple path never needs more than
\(V-1\) edges. Repeating a vertex would create a cycle; if every cycle is
nonnegative, removing it does not hurt.

So pass \(V\) is not trying to find a better ordinary path.

It is asking whether "better" still exists only because the path is looping.

In a currency graph, looping is exactly the thing we care about. If the final
pass relaxes an edge, the predecessor pointers contain a cycle. Trace them back
long enough and the loop falls out.

That is why the lab's relaxation panel is deliberately procedural. It is not
just a performance plot. It is showing the witness being manufactured.

## What This Does Not Prove

A negative cycle in a quote graph is weaker than a tradeable opportunity.

It does not prove:

```text
all legs fill
the sizes fit available depth
the quotes remain valid
the venues allow the trade
the settlement and credit assumptions are harmless
the latency budget survives the route
```

It proves a narrower thing:

```text
under this executable-rate model, one directed cycle multiplies above one
```

That narrower thing is still valuable. It is a clean certificate. It lets you
debug the price sheet, check the data pipeline, or route a human's attention to
the exact edges where the contradiction lives.

For research code, I would keep three detectors side by side:

```text
midpoint graph:       finds theoretical inconsistencies
executable graph:     includes bid/ask, fees, and impact
filled-trade replay:  checks what the system could actually have done
```

Only the last one is a P&L claim.

The negative cycle is the algebraic alarm bell.

It rings before the market tells you whether anyone was actually standing at
the door.

## Reproducibility Notes

The executable artifact is
[`assets/js/fx-negative-cycle-lab.js`]({{ '/assets/js/fx-negative-cycle-lab.js' | relative_url }}).

The lab builds:

```text
an arbitrage-free latent USD value for each currency
directed executable rates after cost and impact
optional quote-gap shocks along a named cycle
negative-log graph weights
Bellman-Ford predecessor recovery
brute-force simple-cycle enumeration for audit
analytic break-even gap for the named injected loop
```

The current Node audit runs `29,353` checks across clean, stale-cross,
dealer-gap, and funding-loop sheets. It checks:

```text
every quote sheet is a complete directed graph with no self edges
each edge weight equals -log(executable_rate)
the pair lookup points back to the same edge object
best cycles are ordered, closed, and simple
clean sheets have no negative cycles
Bellman-Ford agrees with brute-force cycle enumeration
the final Bellman-Ford pass is exactly the negative-cycle signal
extracted Bellman-Ford cycles multiply above one
product-rate and negative-log ledgers agree
the named loop product equals exp((gap - costs) / 10000)
the named loop's displayed threshold equals its executable costs
higher per-leg costs do not improve the best cycle
larger injected quote gaps do not reduce the best margin
zero-cost zero-gap sheets round-trip to one
the default article example remains USD -> EUR -> JPY -> USD
UI parameter cleaning clamps costs, gaps, impact, scenario, and size
```

The worst product/log ledger discrepancy in the audit is about
`1.3e-15`. That last pair of monotonic checks matters. If costs make an
"arbitrage detector" more excited, or a bigger quote gap makes it less excited
in this controlled setup, the bug is in the detector.

[^princeton]: Kevin Wayne and Robert Sedgewick, ["Shortest Paths"](https://www.cs.princeton.edu/courses/archive/spr04/cos226/lectures/shortest-path.4up.pdf), COS 226 lecture notes, Princeton. The notes include Bellman-Ford relaxation, negative cycles, and a currency-arbitrage example.

[^ford]: Lester R. Ford Jr., ["Network Flow Theory"](https://www.rand.org/pubs/papers/P923.html), RAND Corporation, P-923, 1956.

[^bellman]: Richard Bellman, "On a Routing Problem," *Quarterly of Applied Mathematics* 16(1), 87-90, 1958. DOI: [10.1090/qam/102435](https://doi.org/10.1090/qam/102435). David Eppstein's graph-algorithms notes list the Bellman and Ford historical references together: ["Shortest paths"](https://ics.uci.edu/~eppstein/163/lecture3a.pdf).

[^akram-ideas]: Q. Farooq Akram, Dagfinn Rime, and Lucio Sarno, ["Arbitrage in the foreign exchange market: Turning on the microscope"](https://ideas.repec.org/a/eee/inecon/v76y2008i2p237-253.html), *Journal of International Economics* 76(2), 237-253, 2008.

[^akram-cepr]: Dagfinn Rime, Lucio Sarno, and Farooq Akram, ["Arbitrage in the foreign exchange market: Turning on the microscope"](https://cepr.org/voxeu/columns/arbitrage-foreign-exchange-market-turning-microscope), VoxEU, 25 October 2008.
