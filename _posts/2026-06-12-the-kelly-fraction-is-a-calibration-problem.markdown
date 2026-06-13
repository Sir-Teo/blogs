---
layout: post
title: "The Kelly Fraction Is a Calibration Problem"
description: "Why growth-optimal betting is less about bravery and more about calibrated probabilities, model risk, and drawdown-aware sizing."
date: 2026-06-12 15:30:00 -0400
categories: quantitative-finance
tags: [kelly-criterion, calibration, quantitative-finance, statistics, machine-learning, risk]
excerpt: "The Kelly criterion is often introduced as a formula for how much to bet. In real ML and trading systems, the hard part is not the algebra. It is whether the probability is calibrated enough to deserve leverage."
---

The Kelly criterion is usually taught as a beautiful little answer to a
gambling question. If a bet pays even money and wins with probability \(p\), bet
\(2p - 1\) of your bankroll. If \(p = 0.60\), the full Kelly fraction is 20%.

That answer is correct for the toy problem. It is also where many real systems
start to become dangerous.

In a production betting, trading, or allocation system, the hard part is rarely
typing the formula. The hard part is deciding whether the probability that goes
into the formula is calibrated, stable, and measured against the same odds the
system will actually trade. A five-point error in probability can become a
ten-point error in position size at even odds. A model that looks excellent by
accuracy can still be ruinous if its 60% forecasts only win 53% of the time.

<div class="callout">
  <strong>Thesis:</strong> Kelly sizing is not primarily a courage problem. It
  is a calibration problem. The fraction should be treated as the last step of a
  probabilistic forecasting system, not as a magic multiplier placed on top of a
  backtest.
</div>

This is not investment advice. The examples below are deliberately simplified:
independent binary bets, even-money payouts, no transaction costs, no market
impact, and no liquidity constraints. The simplification is useful because it
isolates the core failure mode: overconfident probabilities create oversized
positions.

## The Formula Is the Easy Part

For a binary bet that wins \(b\) units per unit wagered and loses the stake when
wrong, the expected log-growth from betting fraction \(f\) is

\[
G(f; p, b)
=
p\log(1 + bf)
+
(1-p)\log(1-f).
\]

Maximizing this expression gives the classical Kelly fraction

\[
f^\* = \frac{bp - (1-p)}{b}.
\]

At even money, \(b=1\), so \(f^\* = 2p-1\). The connection to information
theory comes from Kelly's original 1956 paper: the growth rate of capital can be
linked to the information rate of a channel when bets are sized using the
available signal.[^kelly] Thorp later made the criterion famous in blackjack,
sports betting, and securities markets.[^thorp] MacLean, Thorp, and Ziemba's
edited volume remains one of the broad references on both the good and bad
properties of Kelly-style capital growth.[^maclean]

The formula has an appealing moral clarity. If you know the probability and the
payoff, there is a unique fraction that maximizes long-run log wealth. Bet less
and you leave asymptotic growth on the table. Bet more and you lower growth,
increase drawdowns, and can eventually turn a positive edge into negative
geometric growth.

But the word "know" is doing almost all of the work.

## Calibration Is Not Accuracy

A classifier can be accurate and still useless for sizing. Suppose a model ranks
opportunities well: its top bucket wins more often than its middle bucket, and
its middle bucket wins more often than its bottom bucket. That is discrimination
or ranking quality. Kelly sizing needs something stricter. It needs calibrated
probabilities.

A probability forecast is calibrated when events assigned probability 60%
actually happen about 60% of the time, events assigned probability 70% happen
about 70% of the time, and so on. This idea has a long history in forecast
verification, including Brier's scoring rule for probability forecasts and
Dawid's work on calibrated Bayesian forecasters.[^brier][^dawid]

Modern machine learning makes this distinction practical. Guo, Pleiss, Sun, and
Weinberger showed that modern neural networks can be poorly calibrated even when
they are accurate, and that temperature scaling can often improve probability
calibration with a simple held-out adjustment.[^guo] The lesson carries directly
into trading and betting: the model score is not yet a stake size. It is an
input into a calibration layer, which is then an input into a sizing rule.

<figure class="research-figure">
<svg viewBox="0 0 800 300" role="img" aria-labelledby="kelly-pipeline-title kelly-pipeline-desc">
  <title id="kelly-pipeline-title">Kelly sizing as a forecasting pipeline</title>
  <desc id="kelly-pipeline-desc">A model score passes through calibration, odds comparison, sizing, and monitoring before it becomes a position.</desc>
  <defs>
    <marker id="kelly-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#5d6872"></path>
    </marker>
  </defs>
  <rect x="28" y="64" width="132" height="72" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="94" y="94" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Model score</text>
  <text x="94" y="116" text-anchor="middle" font-size="12" fill="#5d6872">ranking signal</text>
  <line x1="160" y1="100" x2="214" y2="100" stroke="#5d6872" stroke-width="2" marker-end="url(#kelly-arrow)"></line>

  <rect x="222" y="64" width="132" height="72" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="288" y="94" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Calibration</text>
  <text x="288" y="116" text-anchor="middle" font-size="12" fill="#5d6872">score to probability</text>
  <line x1="354" y1="100" x2="408" y2="100" stroke="#5d6872" stroke-width="2" marker-end="url(#kelly-arrow)"></line>

  <rect x="416" y="64" width="132" height="72" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="482" y="94" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Market odds</text>
  <text x="482" y="116" text-anchor="middle" font-size="12" fill="#5d6872">is there edge?</text>
  <line x1="548" y1="100" x2="602" y2="100" stroke="#5d6872" stroke-width="2" marker-end="url(#kelly-arrow)"></line>

  <rect x="610" y="64" width="132" height="72" rx="8" fill="#ffffff" stroke="#b45309" stroke-width="2"></rect>
  <text x="676" y="94" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Size</text>
  <text x="676" y="116" text-anchor="middle" font-size="12" fill="#5d6872">fraction of capital</text>

  <path d="M676 164 C676 232, 94 232, 94 164" fill="none" stroke="#2563eb" stroke-width="2" marker-end="url(#kelly-arrow)"></path>
  <text x="385" y="236" text-anchor="middle" font-size="13" fill="#172026">outcomes update calibration, drawdown limits, and model trust</text>
  <text x="385" y="266" text-anchor="middle" font-size="13" fill="#5d6872">the fraction is an output of the forecasting system, not a replacement for it</text>
</svg>
<figcaption>
Kelly appears at the end of the pipeline. Before sizing comes probability
calibration; after sizing comes monitoring.
</figcaption>
</figure>

## The Overconfidence Tax

The easiest way to see the problem is to write down the wrong-growth function.
If the true probability is \(p\), but the model reports \(\hat p\), then the
system may bet

\[
\hat f = 2\hat p - 1
\]

at even odds, while realized log growth is still

\[
G(\hat f; p, 1)
=
p\log(1+\hat f)
+
(1-p)\log(1-\hat f).
\]

The growth function is asymmetric around the optimum. Betting too little gives
up some growth. Betting too much can destroy it. If the true probability is 53%
and the model says 60%, full Kelly recommends a 20% stake when the true
growth-optimal stake is only 6%. That is not a small rounding error. It is a
different risk regime.

This is why fractional Kelly is so common in practice. A half-Kelly rule is not
just a psychological compromise, although it often helps with drawdowns. It is a
rough defense against estimation error. Baker and McHale study Kelly betting
under parameter uncertainty and show that shrinking bet size can improve
out-of-sample performance when probabilities are estimated rather than known.[^baker]
Busseti, Ryu, and Boyd take a different route by adding drawdown constraints to
Kelly gambling and deriving a convex risk-constrained formulation.[^busseti]

Fractional Kelly is therefore better understood as a model-risk budget:

\[
f_{\text{trade}}
=
\lambda f^\*(\tilde p),
\quad
0 \le \lambda \le 1,
\]

where \(\tilde p\) is a calibrated probability, not the raw model score. The
fraction \(\lambda\) should not be chosen by vibes. It should reflect calibration
error, non-stationarity, dependence between bets, liquidity, tail loss, and the
drawdown a human or institution can actually survive.

## A Small Experiment

A useful local experiment is to create binary opportunities with a real but
noisy edge. A synthetic model ranks those opportunities, then becomes
overconfident by stretching its logits. The experiment should compare four
policies:

- full Kelly using the raw model probability,
- half Kelly using the raw model probability,
- full Kelly after a held-out calibration step,
- a guarded calibrated rule that subtracts a crude uncertainty reserve before
  sizing.

The point would not be that a toy simulator settles portfolio theory. It does
not. The point is more operational: when the model is overconfident, the raw
Kelly policy often has the most impressive in-sample story and the ugliest
realized wealth distribution. Calibration turns a ranking model into a decision
model.

## What I Would Monitor

A serious Kelly-like system needs more than a backtest equity curve. I would
ship it with at least seven diagnostics.

1. Reliability curves by regime. A global calibration curve can hide that the
   model is calibrated in liquid markets and overconfident in thin ones.
2. Expected calibration error and log loss over rolling windows. Accuracy alone
   is not enough because size depends on probability magnitude.
3. Realized edge by predicted edge bucket. A 4% predicted edge bucket should not
   behave like a 0% bucket after costs.
4. Turnover, capacity, and slippage by size bucket. The largest theoretical
   edges are often the least executable.
5. Correlation between active bets. Kelly assumes a compounding process; clustered
   losses can make independent-bet sizing dangerously optimistic.
6. Drawdown-at-risk under replay and block bootstrap. A path that is acceptable
   in expectation may be unacceptable to the person living through it.
7. Kill-switch reasons. A system should record whether it did not trade because
   of missing features, stale calibration, low edge, high uncertainty, or risk
   budget exhaustion.

The calibration layer should be refit on a held-out or rolling sample, never on
the same labels used to train the predictive model without correction. Platt
scaling, isotonic regression, beta calibration, temperature scaling, and Bayesian
binning are all reasonable candidates depending on sample size and model
shape.[^platt][^naeini] The method matters less than the discipline: probability
forecasts must be audited as probabilities.

## Where the Toy Model Breaks

Real markets are not a sequence of independent even-money bets. Odds move,
liquidity disappears, constraints bind, taxes matter, and a strategy's own
trading can erase its edge. The edge estimate is also not exogenous. If many
participants use similar data and similar models, the opportunity may vanish or
become crowded exactly when the backtest says to scale.

Kelly also optimizes long-run logarithmic growth, not comfort, reputation,
liability matching, or institutional survival. Samuelson objected to careless
"large numbers" arguments in risk taking, and the later time-average literature
kept the debate alive by asking what kind of averaging is relevant for a single
path through time.[^samuelson][^peters] You do not need to take a side in every
philosophical argument to get the engineering lesson: the objective function has
to match the owner of the capital.

There is also a behavioral warning. Haghani and Dewey studied a simple biased
coin game in which participants were told the coin had a 60% chance of heads;
many still bet in ways that left large amounts of value on the table, and a
substantial fraction went broke.[^haghani] Bet sizing is not intuitive even when
the rules are known. It is much harder when the probabilities come from a model.

## The Takeaway

The Kelly criterion is a sharp instrument. It tells us that edge, odds, and
capital growth are linked by a clean mathematical rule. But sharp instruments
amplify upstream errors.

The practical sequence should be:

1. Build the best probability forecast you can.
2. Calibrate it on data the model did not train on.
3. Compare it to executable odds after costs.
4. Shrink for model risk and drawdown constraints.
5. Monitor calibration and realized edge continuously.

Only then does the Kelly fraction deserve to become a trade size.

The formula is elegant. The system around it is where the intelligence lives.

## References

[^kelly]: John L. Kelly Jr., ["A New Interpretation of Information Rate"](https://www.princeton.edu/~wbialek/rome/refs/kelly_56.pdf), Bell System Technical Journal, 1956.

[^thorp]: Edward O. Thorp, ["The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market"](https://ideas.repec.org/h/wsi/wschap/9789814293501_0054.html), in *The Kelly Capital Growth Investment Criterion*, World Scientific, 2011.

[^maclean]: Leonard C. MacLean, Edward O. Thorp, and William T. Ziemba, [*The Kelly Capital Growth Investment Criterion: Theory and Practice*](https://www.worldscientific.com/worldscibooks/10.1142/7598), World Scientific, 2011.

[^brier]: Glenn W. Brier, ["Verification of Forecasts Expressed in Terms of Probability"](https://journals.ametsoc.org/view/journals/mwre/78/1/1520-0493_1950_078_0001_vofeit_2_0_co_2.xml), *Monthly Weather Review*, 1950.

[^dawid]: A. P. Dawid, ["The Well-Calibrated Bayesian"](https://fitelson.org/seminar/dawid.pdf), *Journal of the American Statistical Association*, 1982.

[^guo]: Chuan Guo, Geoff Pleiss, Yu Sun, and Kilian Q. Weinberger, ["On Calibration of Modern Neural Networks"](https://arxiv.org/abs/1706.04599), ICML 2017.

[^baker]: Rose D. Baker and Ian G. McHale, ["Optimal Betting Under Parameter Uncertainty: Improving the Kelly Criterion"](https://dl.acm.org/doi/abs/10.1287/deca.2013.0271), *Decision Analysis*, 2013.

[^busseti]: Enzo Busseti, Ernest K. Ryu, and Stephen Boyd, ["Risk-Constrained Kelly Gambling"](https://arxiv.org/abs/1603.06183), *The Journal of Investing*, 2016.

[^platt]: John Platt, ["Probabilistic Outputs for Support Vector Machines and Comparisons to Regularized Likelihood Methods"](https://home.cs.colorado.edu/~mozer/Teaching/syllabi/6622/papers/Platt1999.pdf), in *Advances in Large Margin Classifiers*, 1999.

[^naeini]: Mahdi Pakdaman Naeini, Gregory Cooper, and Milos Hauskrecht, ["Obtaining Well Calibrated Probabilities Using Bayesian Binning"](https://ojs.aaai.org/index.php/AAAI/article/view/9602), AAAI 2015.

[^samuelson]: Paul A. Samuelson, ["Risk and Uncertainty: A Fallacy of Large Numbers"](https://www.casact.org/sites/default/files/database/forum_94sforum_94sf049.pdf), *Scientia*, 1963.

[^peters]: Ole Peters and Murray Gell-Mann, ["Evaluating Gambles Using Dynamics"](https://arxiv.org/abs/1405.0585), *Chaos*, 2016.

[^haghani]: Victor Haghani and Richard Dewey, ["Rational Decision-Making Under Uncertainty: Observed Betting Patterns on a Biased Coin"](https://arxiv.org/abs/1701.01427), 2016.
