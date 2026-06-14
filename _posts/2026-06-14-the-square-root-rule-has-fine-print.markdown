---
layout: post
title: "The Square-Root Rule Has Fine Print"
description: "Annualizing a Sharpe ratio by sqrt(252) is not a law of nature. It is an assumption about the clock, the autocovariances, and how returns are reported."
date: 2026-06-14 12:36:00 -0400
categories: quantitative-finance
tags: [sharpe-ratio, autocorrelation, newey-west, hedge-funds, quantitative-finance, risk-management]
excerpt: "The same strategy can look like a 1.5 Sharpe on daily marks and a 0.9 Sharpe after accounting for serial correlation. The spreadsheet is not always lying; sometimes the clock is."
---

The most dangerous number in a strategy deck is often the tiny one in front of
the Sharpe ratio:

```text
daily Sharpe * sqrt(252)
```

It looks like a unit conversion, so it inherits the authority of arithmetic.
Daily becomes annual. Monthly becomes annual. A strategy with smooth marks
becomes clean. A research note becomes shorter.

But the square-root rule is not a law of nature. It is a model.

It says, roughly: the returns you are scaling are close enough to independent
draws from a stable process that variance grows linearly with time. When that
is true, the rule is a useful shorthand. When it is false, the annualized
Sharpe ratio is partly a statement about the sampling clock.

This is not investment advice.

## The Clean Case

Sharpe's 1994 formulation compares differential return to the standard
deviation of that differential return.[^sharpe] For excess returns $$r_t$$,
the one-period ex post Sharpe ratio is

$$
\widehat{S}_1
=
\frac{\bar r}{\hat \sigma_1}.
$$

If returns are independent with constant variance, then a $$q$$-period return

$$
R_t^{(q)} = r_t + r_{t-1} + \cdots + r_{t-q+1}
$$

has mean $$q\mu$$ and variance $$q\sigma^2$$. Therefore

$$
S_q
=
\frac{q\mu}{\sqrt{q}\sigma}
=
\sqrt{q}S_1.
$$

That is the whole spell. Daily to annual becomes $$\sqrt{252}$$ because there
are roughly 252 trading days in a year. Monthly to annual becomes
$$\sqrt{12}$$.

The key phrase is not "square root." The key phrase is "if returns are
independent with constant variance." Financial returns are frequently not that
kind.

## The General Case

For a stationary return process, write the lag-$$k$$ autocovariance as

$$
\gamma_k = \operatorname{Cov}(r_t, r_{t-k}).
$$

The variance of a $$q$$-period sum is not merely $$q\gamma_0$$. It is

$$
\operatorname{Var}(R_t^{(q)})
=
q\gamma_0
+
2\sum_{k=1}^{q-1}(q-k)\gamma_k.
$$

The extra terms are the fine print. Positive autocovariances make multi-period
variance grow faster than the IID calculation. Negative autocovariances make it
grow slower. Either way, the square-root rule has smuggled a time-series model
into a single number.

Lo's 2002 paper makes this point directly for Sharpe ratios: monthly Sharpe
ratios cannot generally be annualized by multiplying by $$\sqrt{12}$$, except
under special assumptions, and serial correlation can materially change both
the level and ranking of reported Sharpe ratios.[^lo]

For long horizons, the object you want is the long-run variance

$$
\Omega
=
\gamma_0 + 2\sum_{k=1}^{\infty}\gamma_k.
$$

Then a clock-aware annualized Sharpe estimate is

$$
\widehat{S}_{\mathrm{LRV}}
=
\frac{252\bar r}{\sqrt{252\widehat{\Omega}}}
=
\frac{\sqrt{252}\bar r}{\sqrt{\widehat{\Omega}}}.
$$

In practice we do not know all the autocovariances. A Newey-West style
heteroskedasticity-and-autocorrelation-consistent estimate truncates the sum
and downweights distant lags with Bartlett weights.[^neweywest] This is not
magic. It is just a way to replace "pretend the lags are zero" with "estimate
how much the lags contribute."

## A Toy Strategy With a Great Daily Sharpe

The lab below simulates daily excess returns from a strategy with four knobs:

1. a base Sharpe when the process is unsmoothed and close to IID;
2. serial correlation in the latent return process;
3. reported-return smoothing, as if marks arrive slowly or stale prices are
   averaged into the series;
4. volatility clustering, which mostly changes uncertainty around the estimate.

The point is not to mimic any fund exactly. The point is to make a
measurement error visible: the same economic path can produce a high
daily-clock Sharpe and a much lower long-run-variance Sharpe.

<div class="sharpe-clock-lab" data-sharpe-clock-lab>
  <div class="sharpe-clock-lab__controls">
    <label>
      Base Sharpe: <output data-value="baseSharpe">0.65</output>
      <input type="range" min="20" max="150" step="5" value="65" data-param="baseSharpe">
    </label>
    <label>
      Autocorrelation: <output data-value="autocorrelation">25%</output>
      <input type="range" min="-35" max="75" step="5" value="25" data-param="autocorrelation">
    </label>
    <label>
      Return smoothing: <output data-value="smoothing">40%</output>
      <input type="range" min="0" max="85" step="5" value="40" data-param="smoothing">
    </label>
    <label>
      Vol clustering: <output data-value="clustering">40%</output>
      <input type="range" min="0" max="100" step="5" value="40" data-param="clustering">
    </label>
    <label>
      Sample length: <output data-value="years">6y</output>
      <input type="range" min="2" max="15" step="1" value="6" data-param="years">
    </label>
    <label>
      Monte Carlo paths: <output data-value="trials">300</output>
      <input type="range" min="100" max="700" step="50" value="300" data-param="trials">
    </label>
  </div>
  <div class="sharpe-clock-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="650" aria-label="Sharpe ratio annualization lab comparing daily square-root scaling, HAC Sharpe, autocorrelation, Monte Carlo estimates, and volatility scaling across sampling horizons"></canvas>
  <div class="sharpe-clock-lab__legend">
    <span><i style="background:#2563eb"></i> Sampling-clock Sharpe</span>
    <span><i style="background:#0f766e"></i> Daily sqrt rule</span>
    <span><i style="background:#be123c"></i> HAC Sharpe</span>
    <span><i style="background:#b45309"></i> Autocorrelation</span>
    <span><i style="background:#7c3aed"></i> Variance scaling</span>
  </div>
  <p class="sharpe-clock-lab__note">
    Deterministic synthetic experiment. The HAC estimate uses a finite
    Newey-West/Bartlett long-run variance estimate on daily returns. The
    aggregation chart uses non-overlapping h-day sums, so the far-right points
    are deliberately noisier in short samples.
  </p>
</div>
<script defer src="{{ '/assets/js/sharpe-clock-lab.js?v=20260614b' | relative_url }}"></script>

Start with the default settings. The daily-clock Sharpe is much higher than the
HAC Sharpe. The reason is visible in two places: the lag-1 autocorrelation is
large, and the volatility of multi-day sums rises faster than the IID
square-root calculation would predict.

Now set **return smoothing** to zero and **autocorrelation** to zero. The
daily-clock Sharpe and HAC Sharpe move much closer together. The Sharpe-by-clock
line becomes flatter. The square-root rule is no longer doing much violence
because its assumptions are closer to true.

Next make **autocorrelation** negative. The naive daily annualization can now be
too pessimistic rather than too optimistic. That is a useful corrective to the
usual moral tale. The problem is not that $$\sqrt{252}$$ always exaggerates
performance. The problem is that it silently assumes away the covariance
structure.

Finally raise **vol clustering** while leaving smoothing low. The point estimate
may not move much. But the Monte Carlo panel widens, because a few volatility
episodes can dominate a short backtest. Conditional heteroskedasticity is often
less about the numerator of the Sharpe ratio and more about the confidence you
should have in the estimate.

## Smooth Returns Are Not Free Risk Reduction

Return smoothing deserves special suspicion because it can make a risky stream
look quiet without changing the underlying economics.

Suppose true returns are $$x_t$$ but reported returns are a smoothed average:

$$
r_t^{\mathrm{reported}}
=
(1-\theta)x_t
+
\theta r_{t-1}^{\mathrm{reported}}.
$$

The weights sum to one, so the mean is roughly preserved. Daily volatility,
however, falls, and autocorrelation appears. The naive daily Sharpe ratio can
rise because the denominator has been mechanically compressed.

That is not only a toy pathology. Getmansky, Lo, and Makarov study serial
correlation and illiquidity in hedge fund returns, arguing that illiquid
portfolios tend to have smoother reported returns, which can understate
volatility and increase risk-adjusted performance measures such as the Sharpe
ratio.[^glm] Their model is more serious than the one-line filter above, but
the intuition is the same: a stale mark can be a volatility suppressant.

The long-run variance asks a different question. It does not ask how volatile
one reported day looks. It asks how much variance accumulates when days are
added together. Smoothing can hide variance at the daily clock, but it cannot
make the long-horizon cumulative risk disappear.

## The Ratio Is a Statistic, Not a Trophy

There are three separable questions that often get collapsed into one Sharpe
ratio:

1. What is the mean excess return per unit of one-period volatility?
2. How does variance accumulate across time?
3. How uncertain is the estimate after seeing only this sample?

The IID annualized Sharpe answers the first question and assumes the second and
third are harmless. A HAC Sharpe is better for the second question. It is not a
full answer to the third, especially with fat tails, regime shifts, leverage
changes, option-like payoffs, and selection bias from trying many strategies.

This is why a single "corrected Sharpe" can still be misleading. A useful
research report should show the clock:

- the return sampling frequency and calendar;
- the autocorrelation function of excess returns;
- naive and long-run-variance annualized Sharpe ratios;
- Sharpe by aggregation horizon, such as daily, weekly, monthly, and quarterly;
- confidence intervals or bootstrap uncertainty that respect the time series;
- whether marks are exchange-traded, model-priced, stale, interpolated, or
  otherwise smoothed;
- transaction costs, capacity, drawdowns, skew, and tail exposure beside the
  ratio.

The last bullets are not decorative. A strategy with a clean Sharpe and hidden
left-tail exposure is not clean. A strategy with a high Sharpe because it marks
illiquid positions slowly is not high quality. A strategy whose Sharpe vanishes
when sampled weekly was partly a clock effect.

## A Better Habit

I like reporting Sharpe ratios. They compress a real tradeoff into a number
people understand. The mistake is to let compression turn into erasure.

The habit I want in a quant notebook is simple:

```text
never report a Sharpe ratio without reporting the clock that made it
```

If the daily, weekly, and monthly versions agree, great. The square-root rule
earned its convenience. If they disagree, that disagreement is not a nuisance
to hide in an appendix. It is information about the strategy, the marks, and
the market microstructure underneath the return series.

The Sharpe ratio is not one number. It is a measurement taken through a clock.

## Notes

[^sharpe]: William F. Sharpe, "The Sharpe Ratio," *Journal of Portfolio Management*, 1994. [Stanford reprint](https://web.stanford.edu/~wfsharpe/art/sr/sr.htm).

[^lo]: Andrew W. Lo, "The Statistics of Sharpe Ratios," *Financial Analysts Journal*, 2002. [CFA Institute](https://rpc.cfainstitute.org/research/financial-analysts-journal/2002/the-statistics-of-sharpe-ratios), [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=377260).

[^neweywest]: Whitney K. Newey and Kenneth D. West, "A Simple, Positive Semi-Definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix," *Econometrica*, 1987. [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=225071).

[^glm]: Mila Getmansky, Andrew W. Lo, and Igor Makarov, "An Econometric Model of Serial Correlation and Illiquidity in Hedge Fund Returns," *Journal of Financial Economics*, 2004. [MIT PDF](https://web.mit.edu/Alo/www/Papers/JFE2004Pub.pdf), [NBER working paper](https://www.nber.org/system/files/working_papers/w9571/w9571.pdf).
