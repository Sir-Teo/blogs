---
layout: post
title: "A Trade Is a Trajectory"
description: "The price in a portfolio model is not the price a large order receives. Execution turns an investment idea into a path through liquidity, volatility, market impact, and information leakage."
date: 2026-06-13 01:20:00 -0400
categories: quantitative-finance
tags: [optimal-execution, market-impact, quantitative-finance, control, microstructure]
excerpt: "The paper portfolio owns a decision price. The real portfolio owns the path by which the order becomes a position."
---

At 9:42 a portfolio manager decides to sell.

The model has done its job. The position is too large for the new forecast; the
expected return no longer compensates for the risk; the target portfolio is
clear. On paper, the trade is already finished. Sell $$Q$$ shares at the decision
price $$S_0$$, update the book, move on.

The market does not honor that fiction.

The desk now owns a path: how much to release, when to release it, where to
route it, how aggressively to cross the spread, how much residual inventory to
carry, and how much information to reveal. The realized portfolio will not be
marked at the decision price. It will be marked at the prices created by that
path.

Perold's implementation shortfall is the clean name for this gap between the
paper portfolio and the implemented portfolio.[^perold] The phrase sounds
accounting-like, but it is really a warning: alpha is not owned until it is
executed.

<div class="callout">
  <strong>Desk rule:</strong> the decision price is a coordinate. Execution is
  the curve drawn through market liquidity to reach the target portfolio.
</div>

## Arrival

For a buy order, a stripped-down shortfall calculation is

$$
\text{shortfall}
=
\frac{1}{Q}\sum_{i=1}^N q_i S_i - S_0,
$$

where $$q_i$$ is the child order filled at step $$i$$, $$\sum_i q_i = Q$$, and
$$S_i$$ is the realized execution price. For a sell order the sign changes, but
the benchmark role of $$S_0$$ is the same. It is the arrival price: the price at
which the paper decision became an execution problem.

This number is richer than a commission line item. It mixes spread, temporary
impact, permanent impact, delay, adverse selection, incomplete fills, and the
opportunity cost of whatever remains undone. It also prevents a convenient
mistake. A strategy with beautiful paper alpha but terrible implementation is
not a high-Sharpe strategy with costs. It is a different strategy.

Bertsimas and Lo put this into a dynamic optimization frame: choose a sequence
of trades over a finite horizon to minimize execution cost under a price-impact
model.[^bertsimas] Almgren and Chriss added the mean-variance geometry that many
execution discussions still orbit: some schedules minimize expected cost; some
minimize uncertainty; the useful object is the frontier between them.[^almgren]

## Footprint, Weather, Patience

There are three forces in the simple version of the problem.

The first is footprint. A large child order consumes liquidity and pushes the
execution price away from the arrival price. In the clean quadratic model, if
$$x_i$$ is remaining inventory after step $$i$$, then temporary impact behaves
like

$$
\sum_{i=1}^N (x_{i-1} - x_i)^2.
$$

This term likes patience. It says: split the order, avoid concentration, do not
slam the book unless you must.

The second is weather. While inventory remains, prices move. A stylized
inventory-risk term is

$$
\sigma^2 \sum_{i=1}^N x_i^2 \Delta t.
$$

This term likes urgency. High volatility, long horizons, and institutional
drawdown limits all make residual inventory expensive.

The third is patience with a sign. If the asset has favorable expected drift
while you are selling, waiting can help. If the drift is adverse, waiting is a
tax. The same order size can deserve a different path when the trade is
liquidity-motivated, risk-motivated, alpha-motivated, or forced by a margin
constraint.

Those forces are why "minimize transaction costs" is too vague. A schedule that
minimizes expected footprint may maximize exposure to price movement. A schedule
that minimizes risk may pay too much impact. Execution is the art of choosing
which regret you prefer.

## The Book Has Memory

The simple model treats each child order as if it pays a local cost and then
walks away. Real books remember.

Obizhaeva and Wang make this memory explicit by modeling supply and demand as
dynamic objects. The key state variable is resilience: how quickly liquidity
recovers after a trade consumes it.[^obizhaeva] Two assets with the same spread
and displayed depth can require different execution if one book refills quickly
and the other stays wounded.

That single word, resilience, changes the mental model. Market impact is not
just a function from size to cost. It is a system response. A child order changes
the state in which the next child order arrives.

Recent empirical work keeps pushing in the same direction. Maitrier, Loeper,
Kanazawa, and Bouchaud use Tokyo Stock Exchange data with trader identifiers and
argue that the square-root law of impact has microscopic roots: impact appears
already at the child-order level after the market digests the trade, and
synthetic metaorders reconstructed by scrambling trader identity display similar
behavior.[^maitrier] The lesson is not that one universal formula solves
execution. The lesson is that impact has mechanical structure, and the structure
has to be estimated rather than hand-waved.

## The No-Free-Churn Test

An execution model should fail loudly if it allows profitable round trips.

Gatheral's no-dynamic-arbitrage principle says that expected trading costs
should not become negative just because a trader buys, sells, and harvests their
own market impact.[^gatheral] Gatheral and Schied show why transient-impact
models need regularity conditions: plausible-looking decay functions can create
price manipulation or ill-behaved optimal strategies.[^gatheral-schied]

This is where machine learning needs humility. A policy network can predict
fills, choose venues, and adapt to state. But if the learned simulator rewards
churn, or if its impact model makes round trips profitable, the model has
learned an accounting bug in the market universe it was given.

The audit question is simple:

$$
\text{expected cost of a round trip} \ge 0.
$$

If that inequality fails, do not tune the policy. Fix the world model.

## Desk Simulator

The lab below solves a discrete liquidation problem. It is deliberately small:
one asset, uniform time buckets, quadratic temporary impact, inventory risk, and
an optional drift term while the residual position is still held.

The optimizer chooses an inventory path $$x_0,\ldots,x_N$$ with $$x_0=1$$ and
$$x_N=0$$. The chart shows that path against VWAP and plots the cost-risk
frontier produced by changing risk aversion. Costs are in basis points of traded
notional; risk is the standard deviation of implementation shortfall caused by
holding residual inventory during the horizon.

Under the hood, the code solves the first-order conditions of a quadratic
program. For the interior inventory points, the equation is tridiagonal:

$$
-\eta x_{k-1}
+
(2\eta+\lambda\sigma^2\Delta t)x_k
-
\eta x_{k+1}
=
\frac{\mu\Delta t}{2}.
$$

The left side says that the path should be smooth when temporary impact
$$\eta$$ is expensive, but should shrink inventory when risk aversion
$$\lambda$$ and volatility $$\sigma$$ are expensive. The right side is drift
$$\mu$$: positive drift while selling makes waiting less costly; negative drift
makes waiting hurt. The JavaScript implementation solves this tridiagonal
system directly, then recomputes the frontier by sweeping $$\lambda$$.

<div class="execution-lab" data-execution-lab>
  <div class="execution-lab__controls">
    <label>
      Order size: <output data-value="order">12% ADV</output>
      <input type="range" min="2" max="35" value="12" data-param="order">
    </label>
    <label>
      Daily volatility: <output data-value="volatility">1.8%</output>
      <input type="range" min="50" max="450" step="10" value="180" data-param="volatility">
    </label>
    <label>
      Impact slope: <output data-value="impact">12 bps</output>
      <input type="range" min="2" max="40" value="12" data-param="impact">
    </label>
    <label>
      Half-spread: <output data-value="spread">2 bps</output>
      <input type="range" min="0" max="12" value="2" data-param="spread">
    </label>
    <label>
      Horizon: <output data-value="horizon">3.0 h</output>
      <input type="range" min="30" max="390" step="15" value="180" data-param="horizon">
    </label>
    <label>
      Urgency: <output data-value="urgency">45%</output>
      <input type="range" min="0" max="100" value="45" data-param="urgency">
    </label>
    <label>
      Drift while selling: <output data-value="drift">0 bps/day</output>
      <input type="range" min="-80" max="80" step="5" value="0" data-param="drift">
    </label>
    <label>
      Slices: <output data-value="slices">16</output>
      <input type="range" min="8" max="28" step="2" value="16" data-param="slices">
    </label>
  </div>
  <div class="execution-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="460" aria-label="Optimal execution simulator with inventory paths and cost-risk frontier"></canvas>
  <div class="execution-lab__legend">
    <span><i style="background:#0f766e"></i> Optimal inventory</span>
    <span><i style="background:#b45309"></i> VWAP inventory</span>
    <span><i style="background:#2563eb"></i> Current frontier point</span>
    <span><i style="background:#7c3aed"></i> Cost-risk frontier</span>
  </div>
  <p class="execution-lab__note">
    Deterministic toy model. Costs are expressed in basis points of traded
    notional; risk is the standard deviation of implementation shortfall from
    holding residual inventory during execution.
  </p>
</div>
<script defer src="{{ '/assets/js/execution-lab.js' | relative_url }}"></script>

Try the lab as if you were at the desk:

- Raise daily volatility. Inventory risk gets louder, so the optimal path moves
  forward.
- Raise impact slope. Concentrated child orders become expensive, so the path
  flattens.
- Push drift negative. Waiting now has adverse expected carry, so the model
  accelerates.
- Push drift positive. Waiting becomes less painful, and the optimizer is more
  willing to let footprint fall.

VWAP is useful as a benchmark because it is legible. It is not sacred. In the
frontier view it is simply another point, often reasonable, sometimes dominated,
and always conditional on the market state the model assumes.

## Run Sheet

If I were reviewing a real execution system, I would want the post-trade file to
look like an experiment log, not a screenshot of a fill summary.

Record the arrival price, decision time, release time, completion time, and
benchmark. Record every child order: size, venue, limit price, fill, cancel,
queue outcome, and timestamp. Record participation rate by interval relative to
realized volume. Separate spread paid, temporary impact, permanent impact,
delay, and residual opportunity cost. Compare the pre-trade impact forecast with
realized shortfall. Measure post-trade reversion at multiple horizons. Re-run the
same impact model on a buy-sell round trip and check that churn loses money.

The point is not bureaucracy. It is identifiability. Without this log, the desk
cannot tell whether a bad fill came from bad alpha, bad urgency, bad venue
selection, bad impact calibration, slow book resilience, or simple bad luck.

## Open Questions

The execution research program I trust would combine learning with constraints.
It would let policies adapt to order-book state, but it would not let them
violate inventory conservation or no-dynamic-arbitrage. It would report
uncertainty about impact decay, not only a recommended slice. It would separate
alpha urgency from liquidity urgency. It would stress every recommendation under
wider spreads, slower resilience, higher volatility, lower hidden liquidity, and
information leakage.

The dream is not an algorithm that always trades fast or always hides. The dream
is a system that knows what kind of market it is currently inside.

That is why a trade is a trajectory. Prediction decides where the portfolio
should go. Execution decides the path, and the path writes itself into returns.

## Notes

[^perold]: Andre F. Perold, "The Implementation Shortfall: Paper vs. Reality," *Journal of Portfolio Management*, 1988. [Harvard Business School](https://www.hbs.edu/faculty/Pages/item.aspx?num=2083).

[^bertsimas]: Dimitris Bertsimas and Andrew W. Lo, "Optimal Control of Execution Costs," *Journal of Financial Markets*, 1998. [MIT abstract](https://web.mit.edu/Alo/www/Papers/bertlo98.html).

[^almgren]: Robert Almgren and Neil Chriss, "Optimal Execution of Portfolio Transactions," *Journal of Risk*, 2000. [Journal of Risk](https://www.risk.net/journal-risk/2161150/optimal-execution-portfolio-transactions).

[^obizhaeva]: Anna Obizhaeva and Jiang Wang, "Optimal Trading Strategy and Supply/Demand Dynamics," *Journal of Financial Markets*, 2013. [MIT PDF](https://web.mit.edu/wangj/www/pap/ObizhaevaWang13.pdf).

[^gatheral]: Jim Gatheral, "No-Dynamic-Arbitrage and Market Impact," *Quantitative Finance*, 2010. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1292353).

[^gatheral-schied]: Jim Gatheral and Alexander Schied, "Dynamical Models of Market Impact and Algorithms for Order Execution," in *Handbook on Systemic Risk*, 2013. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2034178).

[^maitrier]: Guillaume Maitrier, Gregoire Loeper, Kiyoshi Kanazawa, and Jean-Philippe Bouchaud, "The double square-root law: Evidence for the mechanical origin of market impact using Tokyo Stock Exchange data," 2025. [arXiv](https://arxiv.org/abs/2502.16246).
