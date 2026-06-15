---
layout: post
title: "Prices Forecast With a Tab"
description: "Prediction markets and proper scoring rules are the same incentive idea wearing different interfaces. LMSR turns a log score into an always-on market maker with bounded loss."
date: 2026-06-14 02:57:00 -0400
categories: quantitative-finance
tags: [prediction-markets, proper-scoring-rules, lmsr, market-making, forecasting, information-aggregation]
excerpt: "A prediction-market price is not just a quote. Under a market scoring rule, moving the price means changing a public forecast and accepting the scoring-rule consequences."
---

A prediction market looks like a tiny exchange.

There is a contract that pays one dollar if an event happens. People buy and
sell. The displayed price drifts from 50 cents to 63 cents to 78 cents. It is
natural to read that price as a probability.

But the more interesting object is not the contract.

It is the market maker.

In a thin market, a continuous market maker is an engine for turning belief into
price. It must quote a price before anyone else is willing to stand on the other
side. It must move the price when someone trades. It must not be a money pump.
And if it is designed well, the cost of moving the price should have a very
specific meaning:

```text
you are replacing the public forecast with your forecast
```

Hanson's market scoring rule makes that sentence literal.[^hanson-lmsr] A
trader who moves the market from probability \(p\) to probability \(q\) is paid
as if they changed a scored forecast from \(p\) to \(q\). The market interface
and the forecast-evaluation interface become the same machine.

## Truth Has a Payoff Shape

Start without markets. Suppose a forecaster reports \(q\), and the event
outcome is \(y \in \{0,1\}\). A scoring rule pays the forecaster based on
\((q,y)\). The rule is proper if a forecaster maximizes expected score by
reporting their true belief.

The logarithmic score is

$$
S_{\log}(q,y)=y\log q+(1-y)\log(1-q).
$$

If the forecaster believes the event probability is \(p\), their expected score
for reporting \(q\) is

$$
p\log q+(1-p)\log(1-q),
$$

which is maximized at \(q=p\). The Brier score, introduced for probability
weather forecasts, has the same properness property in squared-error
clothing.[^brier] Gneiting and Raftery's review gives the broader statistical
theory: proper scoring rules evaluate probabilistic forecasts in a way that
rewards honest distributions, not just lucky categorical guesses.[^gneiting]

This is why log loss is not merely a training loss and Brier score is not merely
a calibration metric. They are incentive geometries. They define what it costs
to lie by a little or by a lot.

Now put a market skin on the same idea.

If a trader moves the public probability from \(p_{\text{old}}\) to
\(p_{\text{new}}\), pay them after the event by

$$
S(p_{\text{new}}, y)-S(p_{\text{old}}, y).
$$

If their belief is \(p_{\text{new}}\), this trade is locally worthwhile. If they
try to move the market away from their belief, expected score falls. A sequence
of traders can each improve the current forecast by accepting the incremental
scoring-rule bet.

The exchange is doing forecast revision.

## LMSR Puts the Score on Tap

The logarithmic market scoring rule has a clean automated-market-maker form.
For two outcomes, let \(q_1\) and \(q_0\) be the number of outstanding shares
that pay one dollar if the event happens or does not happen. Define the cost
function

$$
C(q_1,q_0)
=
b \log \left(e^{q_1/b}+e^{q_0/b}\right).
$$

The instantaneous price of the yes share is the derivative:

$$
p_1(q)=
\frac{e^{q_1/b}}{e^{q_1/b}+e^{q_0/b}}.
$$

Buying shares changes \(q\). The trader pays

$$
C(q+\Delta q)-C(q).
$$

This is the cost-function view of LMSR. It is convenient because the market
maker can quote a price for any trade, no counterparty required. The parameter
\(b\) is liquidity. Larger \(b\) makes the price curve flatter: a trader must
buy more shares to move the price the same distance. Smaller \(b\) makes the
market responsive, but expensive for the market maker in a different way:
prices jump around more.

The subsidy is bounded. In a binary market initialized at zero inventory, the
market maker's worst-case loss is at most

$$
b\log 2.
$$

That is the beautiful bargain. Continuous liquidity is not free, but its maximum
loss can be budgeted up front. The market maker is not predicting the event. It
is selling a mechanism for other people to reveal information.

## A Forecast You Can Buy Into

The lab below has two linked parts.

First, it plots the expected log score and expected Brier score for a binary
event. Move the reported probability away from the true belief and both scores
penalize the report.

Second, it runs a tiny LMSR market. Traders receive noisy private signals about
the event, convert those signals into beliefs, and move the market partway
toward those beliefs. The market maker updates price through the LMSR cost
function and tracks its worst-case loss.

This is not a production market simulator. It leaves out budgets, risk
aversion, strategic timing, correlated signals, fees, manipulation, and
settlement risk. It is a glass-box experiment for the central mechanism:

```text
proper scoring rule + sequential updates = automated prediction market
```

<style>
  .lmsr-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .lmsr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(166px, 1fr));
  }

  .lmsr-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .lmsr-lab__controls input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .lmsr-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .lmsr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .lmsr-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .lmsr-lab__metric span,
  .lmsr-lab__legend,
  .lmsr-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .lmsr-lab__metric span {
    display: block;
  }

  .lmsr-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .lmsr-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .lmsr-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .lmsr-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .lmsr-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .lmsr-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="lmsr-lab" data-lmsr-scoring-lab>
  <div class="lmsr-lab__controls">
    <label>
      True probability: <output data-value="trueProb">63%</output>
      <input type="range" min="5" max="95" step="1" value="63" data-param="trueProb">
    </label>
    <label>
      Reported probability: <output data-value="report">78%</output>
      <input type="range" min="2" max="98" step="1" value="78" data-param="report">
    </label>
    <label>
      Liquidity b: <output data-value="liquidity">24</output>
      <input type="range" min="4" max="80" step="1" value="24" data-param="liquidity">
    </label>
    <label>
      Traders: <output data-value="traders">32</output>
      <input type="range" min="2" max="90" step="1" value="32" data-param="traders">
    </label>
    <label>
      Signal accuracy: <output data-value="signal">72%</output>
      <input type="range" min="51" max="95" step="1" value="72" data-param="signal">
    </label>
    <label>
      Aggression: <output data-value="aggression">75%</output>
      <input type="range" min="5" max="100" step="1" value="75" data-param="aggression">
    </label>
    <label>
      Seed: <output data-value="seed">19</output>
      <input type="range" min="1" max="99" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="lmsr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="LMSR prediction market simulator showing proper scoring rules, market price path, liquidity curvature, and market maker loss"></canvas>
  <div class="lmsr-lab__legend">
    <span><i style="background:#0f766e"></i> Log score</span>
    <span><i style="background:#2563eb"></i> Brier score</span>
    <span><i style="background:#7c3aed"></i> LMSR price</span>
    <span><i style="background:#b45309"></i> True probability</span>
    <span><i style="background:#16a34a"></i> Yes signal</span>
    <span><i style="background:#dc2626"></i> No signal</span>
  </div>
  <p class="lmsr-lab__note">
    Deterministic toy experiment. Traders receive binary private signals with
    the selected accuracy, compute a Bayesian posterior around the true event
    probability, and move the LMSR market partway toward that belief. Worst loss
    is measured against the binary LMSR bound \(b\log 2\).
  </p>
</div>
<script defer src="{{ '/assets/js/lmsr-scoring-lab.js?v=20260614a' | relative_url }}"></script>

Try the mechanism.

Move **Reported probability** away from **True probability**. The dashed report
line leaves the top of both expected-score curves. The log score punishes
confident wrongness more sharply near 0 and 1; the Brier score is gentler and
quadratic. Both are proper in the same sense: the expected score is best at the
forecaster's belief. With the default 63% true probability and 78% report, the
expected log-score regret is about 0.058 and the Brier regret is about 0.023.

Now lower **Liquidity b**. The price path gets jumpier because each share moves
the LMSR inventory ratio more. The impact panel shows the same fact as
curvature: for smaller \(b\), a fixed number of yes shares pushes the price
toward 1 much faster.

Raise **Signal accuracy** and **Traders**. The market price usually moves closer
to the true probability, but not monotonically. A finite market is still a noisy
experiment. Signals can arrive in an unlucky order, and aggressive traders can
overshoot.

The important invariant is the loss bar. Even while the price moves, the market
maker's worst-case loss stays under the displayed \(b\log 2\) bound. In the
default run, the market finishes near 80.4%, the worst displayed maker loss is
11.39, and the bound is 16.64. LMSR buys liquidity with a known maximum subsidy.

## The Price Is Not Automatically Truth

Prediction-market evangelism sometimes drifts into magic: prices aggregate all
available information, therefore the price is truth.

No. The price is an aggregation mechanism under assumptions.

It is useful because it is public, compact, and costly to move. A trader who
believes the probability is too low can buy yes shares. Their trade moves the
price and exposes them to the event. If they are wrong, the scoring-rule
difference is paid back in the other direction. This makes the price a running
summary of revealed willingness to take scored risk.

But the price can fail as a probability when the mechanism around it fails:

1. Traders are not risk neutral or cannot take large enough positions.
2. Signals are correlated, so many trades repeat the same evidence.
3. The event definition is ambiguous or settlement is trusted by too few people.
4. Fees, limits, collateral rules, or regulation dominate the scoring incentive.
5. Traders have motives other than final payoff.

The scoring rule solves one problem: how to make honest belief revelation an
expected-payoff optimum for an isolated forecaster. A market adds a social
layer. That layer can aggregate information, but it can also aggregate
constraints, incentives, and noise.

## Why ML Should Care

Modern ML systems emit probabilities everywhere: classifiers, reward models,
retrievers, judges, forecasts, risk scores, route selectors. We often train them
with log loss, evaluate them with Brier score, calibrate them, and then put
humans around them to correct, bet, vote, or decide.

Prediction markets are a reminder that a probability is not only a number. It
can be an interface.

If the interface is a dashboard, people can nod and ignore it. If the interface
is a scored report, a forecaster is paid for calibration and sharpness. If the
interface is a market scoring rule, a group can revise a shared forecast one
trade at a time.

That is a useful design pattern for AI systems:

```text
do not only ask for a probability
choose the mechanism that makes the probability costly to distort
```

The market maker is the quiet part of that mechanism. It defines the price of
changing public belief. In LMSR, that price is not arbitrary. It is the
logarithmic scoring rule, turned sideways into liquidity.

## Paper Trail

[^hanson-lmsr]: Robin Hanson, "Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation," working paper, 2002; later published in *Journal of Prediction Markets*. [PDF](https://mason.gmu.edu/~rhanson/mktscore.pdf). See also Hanson, "Combinatorial Information Market Design," *Information Systems Frontiers*, 2003. [Springer](https://link.springer.com/article/10.1023/A%3A1022058209073), [PDF](https://mason.gmu.edu/~rhanson/combobet.pdf).

[^brier]: Glenn W. Brier, "Verification of Forecasts Expressed in Terms of Probability," *Monthly Weather Review*, 1950. [American Meteorological Society](https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml), [Semantic Scholar](https://www.semanticscholar.org/paper/VERIFICATION-OF-FORECASTS-EXPRESSED-IN-TERMS-OF-Brier/feee6551179612b9691f021b583d8a99b81b9b86).

[^gneiting]: Tilmann Gneiting and Adrian E. Raftery, "Strictly Proper Scoring Rules, Prediction, and Estimation," *Journal of the American Statistical Association*, 2007. [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1198/016214506000001437), [PDF](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf).
