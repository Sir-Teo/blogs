---
layout: post
title: "A Log-Log Line Is Not a Law"
description: "Heavy tails are easy to see and hard to prove. A straight-ish line on a log-log plot is a clue, not a statistical argument."
date: 2026-06-13 02:03:00 -0400
categories: statistics
tags: [power-laws, heavy-tails, statistics, finance, model-diagnostics]
excerpt: "Power-law claims need tail cutoffs, likelihoods, uncertainty, and alternative explanations. The plot is where the work starts."
---

Here is a reliable way to fool yourself:

1. collect a skewed data set;
2. sort the observations;
3. draw a log-log plot;
4. see something almost straight;
5. announce a power law.

The ritual is seductive because power laws are beautiful. If
\(p(x) \propto x^{-\alpha}\), scale changes do not change the basic shape. Ten
times larger is not a new regime; it is the same regime with fewer examples.
That is why power laws show up in stories about city sizes, wealth, earthquakes,
network degrees, file sizes, word frequencies, market moves, and scientific
citations.[^newman]

But "heavy-tailed" and "power-law" are not synonyms. A lognormal distribution,
a stretched exponential, a finite mixture, or a power law with a cutoff can all
look persuasive over a narrow range. The visual slope is a clue. It is not a
theory, and it is not a test.

Clauset, Shalizi, and Newman put the problem bluntly: empirical power-law
detection is hard because the relevant evidence lives in the rare tail, and
because one must identify the range over which the scaling claim is supposed to
hold.[^clauset] Goldstein, Morris, and Yen showed with a simple experiment that
linear fitting on log-log plots is biased and inaccurate compared with maximum
likelihood estimation.[^goldstein]

So the useful question is not "is the plot straight?" It is:

```text
Where does the tail begin?
How many observations are actually in that tail?
Is the fitted exponent stable when the cutoff moves?
Does a plausible non-power-law tail explain the same data?
What mechanism would make the exponent meaningful?
```

The lab below is a small machine for building skepticism.

<div class="tail-lab" data-tail-lab>
  <div class="tail-lab__controls">
    <label>
      Data generator
      <select data-param="distribution">
        <option value="pareto">Pareto / true power law</option>
        <option value="lognormal">Lognormal</option>
        <option value="stretched">Stretched exponential</option>
        <option value="mixture">Mixture with rare shocks</option>
      </select>
    </label>
    <label>
      Sample size: <output data-value="samples">900</output>
      <input type="range" min="120" max="5000" step="40" value="900" data-param="samples">
    </label>
    <label>
      Tail cutoff percentile: <output data-value="cutoff">80th</output>
      <input type="range" min="50" max="95" value="80" data-param="cutoff">
    </label>
    <label>
      Tail-shape knob: <output data-value="shape">2.4</output>
      <input type="range" min="120" max="420" step="5" value="240" data-param="shape">
    </label>
    <label>
      Multiplicative noise: <output data-value="noise">8%</output>
      <input type="range" min="0" max="45" value="8" data-param="noise">
    </label>
  </div>
  <div class="tail-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="520" aria-label="Power-law diagnostic simulator showing log-log CCDF and exponent stability"></canvas>
  <div class="tail-lab__legend">
    <span><i style="background:#0f766e"></i> Empirical CCDF</span>
    <span><i style="background:#7c3aed"></i> Fitted Pareto tail</span>
    <span><i style="background:#b45309"></i> Chosen cutoff</span>
    <span><i style="background:#be123c"></i> Exponent instability</span>
  </div>
  <p class="tail-lab__note">
    Deterministic synthetic experiment. The Pareto fit uses the continuous MLE
    above the selected cutoff. The lognormal comparison is a simple tail
    likelihood comparison, not a full Clauset-Shalizi-Newman p-value procedure.
  </p>
</div>
<script defer src="{{ '/assets/js/power-law-lab.js' | relative_url }}"></script>

The default generator is an actual Pareto distribution. Even there, the fitted
exponent moves when the cutoff changes because the tail has few observations.
Switch to `Lognormal` or `Stretched exponential`. You will often still see a
respectable line on the log-log plot, especially with a finite sample. The
diagnostics become less comforting: the fitted exponent drifts across cutoffs,
the KS distance grows, or the lognormal tail likelihood becomes competitive.

This is the first lesson of heavy-tail work: finite samples can impersonate
asymptotic laws.

## A better ritual

For continuous data above a chosen lower cutoff \(x_{\min}\), the maximum
likelihood estimate for a Pareto density exponent is

$$
\hat{\alpha}
= 1 + n\left[\sum_{i=1}^{n}\log(x_i/x_{\min})\right]^{-1}.
$$

This one line is already better than fitting a straight line through binned
points. It uses the tail observations directly. It also forces the analyst to
state \(x_{\min}\). That cutoff is not clerical. It defines the claim.

A good diagnostic report should include at least four objects:

- the fitted exponent and number of observations above \(x_{\min}\);
- a goodness-of-fit statistic, commonly a Kolmogorov-Smirnov distance between
  empirical and fitted tail CDFs;
- a sensitivity curve showing how \(\hat{\alpha}\) changes as \(x_{\min}\)
  moves;
- likelihood comparisons against alternatives such as lognormal, exponential,
  stretched exponential, or cutoff power-law tails.

Clauset, Shalizi, and Newman combine maximum-likelihood fitting with
goodness-of-fit tests and likelihood-ratio comparisons, then show that some
canonical empirical data sets are consistent with power-law behavior while
others are not.[^clauset] Their companion page hosts implementations of the
methods, which is a useful reminder that this is an algorithmic workflow, not a
plotting style.[^companion]

## Finance makes the trap sharper

Finance is where the distinction between "heavy" and "power" becomes expensive.
Benoit Mandelbrot's 1963 paper on speculative prices argued against the Gaussian
model of price changes and proposed stable Paretian laws as a replacement for
that setting.[^mandelbrot] The enduring lesson is not that every return series
is exactly stable Paretian. It is that tail assumptions are not harmless. They
decide how often your risk system expects large moves.

If daily losses are Gaussian, a six-sigma event is practically mythological. If
losses are heavy-tailed, it may be part of the business model. If the tail is a
finite mixture of calm and crisis regimes, a single exponent can be a false
sense of simplicity. If the tail has a cutoff, extrapolating a pure power law
can overstate impossible extremes.

This is why the mechanism matters. Preferential attachment, multiplicative
growth, self-organized criticality, and mixture processes can all create
heavy-tailed observations, but they imply different interventions. A straight
line does not tell you which machine made it.

## The useful skepticism

I do not read a power-law claim as false. I read it as incomplete until it has
survived a short audit:

```text
show the raw CCDF, not only binned densities
declare xmin before interpreting alpha
fit by likelihood, not visual regression
report how many tail points support the claim
move xmin and show exponent stability
compare against lognormal and cutoff alternatives
explain the generative mechanism
say what decision changes if the law is true
```

The final line matters. If no decision changes, the power law may be ornamental.
If a decision changes, the evidence must be stronger than a line.

Power laws are among the most interesting statistical objects we have because
they connect measurement, mechanism, and scale. That is exactly why they deserve
more care. The plot is an invitation. The law has to be earned.

## Notes

[^newman]: M. E. J. Newman, "Power laws, Pareto distributions and Zipf's law," *Contemporary Physics*, 2005. [arXiv](https://arxiv.org/abs/cond-mat/0412004).

[^clauset]: Aaron Clauset, Cosma Rohilla Shalizi, and M. E. J. Newman, "Power-law distributions in empirical data," *SIAM Review*, 2009. [arXiv](https://arxiv.org/abs/0706.1062).

[^goldstein]: Michel L. Goldstein, Steven A. Morris, and Gary G. Yen, "Problems with Fitting to the Power-Law Distribution," *European Physical Journal B*, 2004. [arXiv](https://arxiv.org/abs/cond-mat/0402322).

[^companion]: Aaron Clauset, "Power-law Distributions in Empirical Data" companion page, including implementations of fitting and goodness-of-fit methods. [Project page](https://aaronclauset.github.io/powerlaws/).

[^mandelbrot]: Benoit Mandelbrot, "The Variation of Certain Speculative Prices," *The Journal of Business*, 1963. [RePEc](https://ideas.repec.org/a/ucp/jnlbus/v36y1963p394.html).
