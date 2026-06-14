---
layout: post
title: "Backtests After the Research Garden"
description: "A beautiful backtest is weak evidence unless you know how many ideas, parameters, filters, assets, and time windows were tried before it won."
date: 2026-06-13 00:35:00 -0400
categories: quantitative-finance
tags: [backtesting, quantitative-finance, multiple-testing, sharpe-ratio, overfitting]
excerpt: "The best strategy in a large research library is selected under intense statistical pressure. Treating its Sharpe ratio as a single clean experiment is how backtests become stories."
---

A backtest is not one experiment if it came out of a research process.

It is the surviving artifact of many experiments: universes, lags, filters,
rebalance rules, volatility targets, transaction-cost assumptions, start dates,
outlier rules, factor definitions, neutralization choices, and parameter grids.
The strategy that reaches the pitch deck is not sampled at random from that
garden. It is selected because it looked good.

That selection step changes the statistics.

<div class="callout">
  <strong>Thesis:</strong> the correct question is not "what was the Sharpe
  ratio of this backtest?" The correct question is "what was the distribution
  of the best Sharpe ratio after the entire search procedure?"
</div>

This is not a cynical point. Some strategies are real. Some market anomalies
survive costs, crowding, publication, and regime shifts. But the evidence has to
be priced correctly. A clean-looking equity curve can be either discovery or
data reuse with a good costume.

White's Reality Check made the data-snooping problem explicit for model
selection: when the same data are used repeatedly for specification search, a
strong-looking winner may owe more to chance than to predictive ability.[^white]
Sullivan, Timmermann, and White applied the idea to technical trading rules and
showed how conclusions change when the full rule universe is treated as part of
the test.[^sullivan] Hansen's superior predictive ability test refined the
Reality Check by improving power against relevant alternatives.[^hansen]

The modern quant version is sharper. Bailey, Borwein, Lopez de Prado, and Zhu
define the probability of backtest overfitting in investment simulations, using
combinatorially symmetric cross-validation to estimate how often in-sample
winners disappoint out of sample.[^pbo] Bailey and Lopez de Prado's deflated
Sharpe ratio adjusts for selection bias, non-normal returns, and the number of
trials behind a reported Sharpe.[^dsr] Harvey, Liu, and Zhu make the same
argument at the factor zoo level: once hundreds of factors have been searched,
the familiar t-statistic hurdle near 2 is too low.[^harvey]

The common theme is simple: a backtest is evidence only after the search budget
has been disclosed.

## The Max Is Not an Average

Suppose a team tests $$m$$ strategies that have no true edge. Each test produces
a one-sided p-value. If the team reports the best one, the relevant null is not

$$
\Pr(p < 0.05) = 0.05.
$$

It is

$$
\Pr(\min_i p_i < 0.05) = 1 - 0.95^m,
$$

under independent null tests. With $$m=100$$, the probability of at least one
nominally significant false discovery is about 99.4%. With $$m=1000$$, it is
essentially certain.

Real strategy libraries are not independent. Variants share signals, assets,
features, code, and assumptions. Correlation reduces the effective number of
independent trials, but it does not restore the single-test interpretation. If
you tried 500 versions of momentum, the winner is not "a momentum strategy with
a Sharpe of 1.8." It is the maximum of a correlated family of noisy estimates.

That is why the phrase "we only show the final model" should make an investor
more nervous, not less. The discarded variants are part of the evidence.

## Sharpe Ratios Are Estimates

Even before multiple testing, Sharpe ratios are noisy. Lo derives the sampling
behavior of Sharpe ratios under several return assumptions and shows why naive
annualization can fail when returns are serially correlated.[^lo] A five-year
monthly backtest is not a microscope. It is 60 observations, often smoothed,
clustered, regime-dependent, and measured after many design choices.

A useful mental model is

$$
\widehat{S}_j = S_j + \epsilon_j,
$$

where $$S_j$$ is a strategy's true Sharpe and $$\epsilon_j$$ is estimation
noise. The strategy selected by a backtest is

$$
j^\star = \arg\max_j \widehat{S}_j.
$$

Selection makes $$\epsilon_{j^\star}$$ special. It is likely positive. The
winner won partly because its noise term helped it. This is the same reason the
tallest child in a classroom is likely to be less exceptional on the next
measurement if yesterday's height included measurement error. In finance, the
next measurement is called live trading.

## Corrections Are Not Rituals

There are several ways to respond. None is magic.

Bonferroni-style correction controls the probability of making even one false
claim across a family of tests. It is simple and often conservative.

False discovery rate procedures, introduced by Benjamini and Hochberg, control
the expected fraction of false discoveries among the discoveries.[^bh] This is
often a better scientific target when many hypotheses may be real and the goal
is to build a research program rather than approve a single trade.

Reality Check and SPA-style tests ask whether the best model in a search
outperforms a benchmark after accounting for the search. Probability of
backtest overfitting asks how often an in-sample winner turns into an
out-of-sample loser under cross-validation. Deflated Sharpe asks whether a
reported Sharpe still clears a hurdle after selection bias and non-normality are
priced in.

The practical rule is not "use this one correction." It is:

1. Define the research universe before looking at the winner.
2. Count failed variants as part of the experiment.
3. Separate model selection from final evaluation.
4. Penalize the selected statistic for search.
5. Treat costs, turnover, capacity, and decay as part of the null, not as a
   footnote after the signal looks good.

## A Little Stress Test

The simulator below creates a research department. In each campaign, the
department tests many candidate strategies. A small fraction may have genuine
pre-cost edge. The rest are null strategies. Each candidate receives a noisy
in-sample Sharpe estimate, a noisy validation estimate, and an expected live
Sharpe after implementation drag.

The chart compares five selection policies:

- always publish the best in-sample backtest;
- publish the best strategy with nominal one-sided $$p < 0.05$$;
- publish only if the best strategy survives Bonferroni correction;
- publish using Benjamini-Hochberg false discovery control;
- reserve a holdout slice, pick the research-half winner, and require
  validation significance.

<div class="backtest-lab" data-backtest-lab>
  <div class="backtest-lab__controls">
    <label>
      Strategies tested: <output data-value="strategies">400</output>
      <input type="range" min="20" max="2000" step="20" value="400" data-param="strategies">
    </label>
    <label>
      Backtest years: <output data-value="years">6</output>
      <input type="range" min="2" max="20" value="6" data-param="years">
    </label>
    <label>
      True edge rate: <output data-value="edgeRate">4%</output>
      <input type="range" min="0" max="25" value="4" data-param="edgeRate">
    </label>
    <label>
      Edge Sharpe: <output data-value="edgeSharpe">0.70</output>
      <input type="range" min="20" max="140" value="70" data-param="edgeSharpe">
    </label>
    <label>
      Strategy correlation: <output data-value="correlation">35%</output>
      <input type="range" min="0" max="80" value="35" data-param="correlation">
    </label>
    <label>
      Live drag: <output data-value="liveDrag">0.20</output>
      <input type="range" min="0" max="80" value="20" data-param="liveDrag">
    </label>
  </div>
  <div class="backtest-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="430" aria-label="Backtest overfitting simulation comparing selection policies"></canvas>
  <div class="backtest-lab__legend">
    <span><i style="background:#0f766e"></i> Selected backtest Sharpe</span>
    <span><i style="background:#b45309"></i> Expected live Sharpe</span>
    <span><i style="background:#7c3aed"></i> Selection rate</span>
    <span><i style="background:#2563eb"></i> False discovery rate</span>
  </div>
  <p class="backtest-lab__note">
    Deterministic simulation, 260 independent research campaigns. A false
    discovery is a selected strategy whose true live Sharpe after drag is not
    positive.
  </p>
</div>
<script defer src="{{ '/assets/js/backtest-lab.js' | relative_url }}"></script>

Try increasing the number of tested strategies while leaving the edge rate near
zero. The best in-sample Sharpe improves, but the expected live Sharpe does not
magically improve with it. The search is finding noise.

Now increase the true edge rate. Multiple testing correction is no longer just
a scold; it becomes a way to separate a crowded discovery set from a random
winner. Finally, increase live drag. A strategy can be statistically real and
economically dead. That distinction matters because markets pay after costs.

## What Should Be Logged

The audit trail of a quant strategy should look more like an experiment registry
than a slide deck. I would want to know:

- the total number of tested variants, including abandoned branches;
- the exact family of hypotheses covered by the search;
- the rules for train, validation, and final holdout periods;
- the transaction-cost and capacity assumptions before seeing performance;
- the selected statistic and its multiple-testing correction;
- the sensitivity of performance to small design changes;
- the live monitoring rule that will retire the strategy.

The last item matters. Backtest overfitting is not only a launch problem. It is
also a monitoring problem. If a strategy was selected from a large library, its
initial live underperformance is not surprising evidence of "bad luck." It may
be the expected regression from selected noise.

## What I Would Try After This

The strongest version of quant research is not less creative. It is more honest
about the denominator.

I would like to see strategy notebooks expose a "search ledger" by default:
each idea, parameter branch, data filter, and rejection should become part of a
machine-readable experiment graph. The final backtest would then be accompanied
by an automatically computed search-adjusted evidence report: effective trial
count, family definition, holdout hygiene, deflated Sharpe, PBO-style
cross-validation diagnostics, cost sensitivity, and live decay triggers.

That sounds bureaucratic until you realize what the alternative is. Without a
ledger, the research process becomes a private multiple-testing machine and the
investor receives only the maximum.

A backtest is a microscope if the experiment was pre-registered. It is a mirror
if the experiment was searched until it smiled back.

## Further Reading

[^white]: Halbert White, "A Reality Check for Data Snooping," *Econometrica*, 2000. [PDF](https://www.ssc.wisc.edu/~bhansen/718/White2000.pdf).

[^sullivan]: Ryan Sullivan, Allan Timmermann, and Halbert White, "Data-Snooping, Technical Trading Rule Performance, and the Bootstrap," *Journal of Finance*, 1999. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=65140).

[^hansen]: Peter Reinhard Hansen, "A Test for Superior Predictive Ability," *Journal of Business & Economic Statistics*, 2005. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=264569).

[^pbo]: David H. Bailey, Jonathan M. Borwein, Marcos Lopez de Prado, and Qiji Jim Zhu, "The Probability of Backtest Overfitting," *Journal of Computational Finance*, 2015. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253).

[^dsr]: David H. Bailey and Marcos Lopez de Prado, "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality," *Journal of Portfolio Management*, 2014. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551).

[^harvey]: Campbell R. Harvey, Yan Liu, and Caroline Zhu, "...and the Cross-Section of Expected Returns," *Review of Financial Studies*, 2016. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2249314).

[^lo]: Andrew W. Lo, "The Statistics of Sharpe Ratios," *Financial Analysts Journal*, 2002. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=377260).

[^bh]: Yoav Benjamini and Yosef Hochberg, "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing," *Journal of the Royal Statistical Society: Series B*, 1995. [DOI](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x).
