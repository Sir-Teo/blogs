---
layout: post
title: "The Average Loses Its Innocence in 3-D"
description: "Stein's paradox says the coordinatewise sample mean can be beaten uniformly once you estimate three or more normal means at the same time."
date: 2026-06-13 22:28:00 -0400
categories: statistics
tags: [james-stein, shrinkage, decision-theory, empirical-bayes, normal-means, statistics]
excerpt: "A biased estimator can dominate the obvious unbiased one under total squared error. The trick is borrowing the vector's noise to decide how much to shrink the whole thing."
---

The average is innocent in one dimension.

Observe a noisy number. Estimate its mean by the number you saw. Under squared
error, that rule is not only natural; it is admissible. Nobody can build another
estimator whose risk is never larger and sometimes smaller.

In two dimensions, the same story survives.

In three dimensions, it breaks.

That is Stein's paradox. If

```text
X ~ Normal_p(theta, sigma^2 I)
```

and loss is total squared error,

```text
loss(delta, theta) = ||delta(X) - theta||^2,
```

then the usual estimator

```text
delta(X) = X
```

has constant risk `p sigma^2`. For `p >= 3`, James and Stein gave a simple
estimator with lower risk for every value of `theta`.[^james-stein] Stein's
earlier Berkeley Symposium paper had already shown the shock: the familiar
best-invariant estimator is inadmissible once the normal mean has dimension
three or more.[^stein-1956] Brown's decision-theoretic treatment makes the
border especially crisp: the one- and two-dimensional location cases are
admissible; the three-and-up case is not.[^brown]

The theorem sounds like a trick because we are used to judging means one at a
time. Stein changes the unit of judgment. He asks for simultaneous accuracy
across the vector.

The coordinates may be baseball players, hospital effects, school effects,
factor returns, benchmark task accuracies, or model deltas across many slices.
If you score the whole vector, every coordinate gets to learn a little from the
others.

## The Shrinkage Rule

The zero-target James-Stein estimator is

```text
delta_JS(X) =
  (1 - ((p - 2) sigma^2) / ||X||^2) X.
```

The multiplier is the shrinkage factor. Large observed norm, little shrinkage.
Small observed norm, heavy shrinkage toward zero.

More generally, with an a priori center `c`,

```text
delta_c(X) =
  c + (1 - ((p - 2) sigma^2) / ||X - c||^2) (X - c).
```

The phrase "a priori" is not decoration. If you pick `c` after looking at the
same data, you changed the procedure and the dominance theorem no longer says
what you want it to say. Shrinkage is not permission to aim at the answer after
you have seen it.

There is also a practical variant:

```text
delta_+(X) =
  max(0, 1 - ((p - 2) sigma^2) / ||X||^2) X.
```

This positive-part rule refuses to let the shrinkage factor go negative. The
ordinary James-Stein rule can overshoot through the origin when `||X||^2` is
tiny; the positive-part rule clamps that behavior. The lab below compares all
three rules instead of asking you to take the geometry on faith.

## The Coordinates Share a Risk Budget

The usual estimator has zero bias:

```text
E[X] = theta.
```

James-Stein gives up that purity. It introduces bias toward the target. The
payoff is variance reduction in the aggregate loss. In dimensions three and
above, the variance you save beats the bias you introduce for every `theta`.

This is the part that should feel slightly unfair. If the first coordinate is a
product metric and the second is a hospital effect, why should they help each
other?

They help only because the risk function groups them. The theorem is about
estimating the vector under total squared error, not about improving every
coordinate on every realized data set. One coordinate can get worse. A single
sample can get worse. The expectation over noise, summed across coordinates,
gets better.

Efron and Morris's empirical Bayes papers are still the cleanest bridge from
the paradox to practice.[^efron-morris-1972] If the coordinates are exchangeable
effects drawn from some population, then shrinking noisy extremes toward a
center is not a gimmick. It is the posterior mean instinct wearing a
frequentist guarantee.[^efron-morris-1975]

That is why this old theorem still appears under modern names:

- partial pooling in hierarchical models;
- regularization in high-dimensional regression;
- small-area estimation;
- factor shrinkage in portfolio construction;
- leaderboard and benchmark de-noising;
- slice-level evaluation of ML systems.

Different models, same warning: the noisiest extreme coordinate is often
extreme partly because it is noisy.

## A Risk Lab for a Weird Theorem

The simulator uses a known-variance normal means problem. The true vector has
norm

```text
||theta|| = radius * sigma * sqrt(p).
```

That makes **Signal radius** roughly a per-coordinate signal-to-noise scale.
The chart shows risk per coordinate across radii. The metrics report total
risk, because the theorem is about the whole vector.

Try this sequence:

1. set **Dimension** to `2`;
2. move **Signal radius** around and notice that the James-Stein rule is just
   the usual estimator because `p - 2 = 0`;
3. set **Dimension** to `3` or `10`;
4. make **Signal radius** small and watch shrinkage save a lot of risk;
5. make **Signal radius** large and watch the shrinkage factor approach one.

<style>
  .stein-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .stein-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .stein-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .stein-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .stein-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .stein-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .stein-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .stein-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.38);
  }

  .stein-lab__metric span,
  .stein-lab__note,
  .stein-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .stein-lab__metric span {
    display: block;
  }

  .stein-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .stein-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .stein-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.65rem;
  }

  .stein-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .stein-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .stein-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="stein-lab" id="stein-lab" data-james-stein-lab>
  <div class="stein-lab__controls">
    <label>
      Dimension
      <select data-param="dimension">
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="5">5</option>
        <option value="10" selected>10</option>
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
    </label>
    <label>
      Signal radius
      <select data-param="radius">
        <option value="0">0.0</option>
        <option value="0.5">0.5</option>
        <option value="1" selected>1.0</option>
        <option value="2">2.0</option>
        <option value="3">3.0</option>
        <option value="4">4.0</option>
        <option value="5">5.0</option>
      </select>
    </label>
    <label>
      Noise sigma
      <select data-param="sigma">
        <option value="0.5">0.5</option>
        <option value="1" selected>1.0</option>
        <option value="1.5">1.5</option>
      </select>
    </label>
    <label>
      Monte Carlo trials
      <select data-param="trials">
        <option value="1500">1,500</option>
        <option value="4000" selected>4,000</option>
        <option value="8000">8,000</option>
      </select>
    </label>
  </div>
  <div class="stein-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="690" aria-label="James-Stein shrinkage simulator showing risk curves, sample coordinates, and trial-level loss differences"></canvas>
  <div class="stein-lab__legend">
    <span><i style="background:#172026"></i> Usual mean</span>
    <span><i style="background:#7c3aed"></i> James-Stein</span>
    <span><i style="background:#0f766e"></i> Positive-part</span>
    <span><i style="background:#d97706"></i> Observed noisy vector</span>
    <span><i style="background:#be123c"></i> More loss on that trial</span>
  </div>
  <p class="stein-lab__note">
    Deterministic Monte Carlo. The plotted risk is loss averaged over repeated
    noisy observations from the same true vector. The bottom histogram is
    trial-by-trial, which is why some red bars remain even when expected risk is
    lower.
  </p>
</div>
<script defer src="{{ '/assets/js/james-stein-lab.js?v=20260613b' | relative_url }}"></script>

At `p = 10`, `radius = 1`, the default run should show an obvious risk
reduction. At `radius = 5`, shrinkage still helps in expectation, but the
improvement is small because the observed vector usually points in nearly the
right direction. At `p = 2`, the shrinkage coefficient vanishes and the paradox
does not appear.

This is why I like the theorem as a mental calibration device. It is not saying
"always shrink everything." It is saying:

```text
unbiased coordinatewise obviousness is not the same thing
as decision-theoretic optimality under aggregate loss
```

That sentence applies far beyond normal means.

## Where Should the Pooling Stop?

The modern version of Stein's question is not whether shrinkage exists. We know
it does. The harder question is where the pooling boundary belongs.

Suppose a lab reports 80 task-level improvements for a model. Suppose a fund
reports 200 strategy sleeves. Suppose a marketplace reports seller-quality
effects across thousands of shops. Some effects should be pooled hard. Some
should barely be pooled. Some should not share a prior at all.

A useful research system would keep an explicit shrinkage ledger:

- What is the estimand: coordinate loss, total loss, ranking loss, downstream
  utility?
- Which coordinates are exchangeable enough to borrow strength?
- Was the shrinkage target chosen before looking at the noisy estimates?
- How much risk was saved, and where did bias enter?
- Which outliers remain outliers after accounting for selection and noise?

Stein's paradox is old, but this ledger is still rare. We have leaderboards,
dashboards, experiment readouts, factor libraries, and model-eval slices full of
noisy coordinates. We still often publish the raw `X`.

Sometimes the raw average is admissible.

Past dimension two, it has to defend itself.

## Sources

[^stein-1956]: Charles Stein, "Inadmissibility of the Usual Estimator for the Mean of a Multivariate Normal Distribution," *Proceedings of the Third Berkeley Symposium on Mathematical Statistics and Probability*, 1956. [Project Euclid](https://projecteuclid.org/ebooks/berkeley-symposium-on-mathematical-statistics-and-probability/Proceedings-of-the-Third-Berkeley-Symposium-on-Mathematical-Statistics-and/chapter/Inadmissibility-of-the-Usual-Estimator-for-the-Mean-of-a/bsmsp/1200501656), [PDF](https://www.stat.yale.edu/~hz68/619/Stein-1956.pdf).

[^james-stein]: W. James and Charles Stein, "Estimation with Quadratic Loss," *Proceedings of the Fourth Berkeley Symposium on Mathematical Statistics and Probability*, 1961. [PDF](https://www.stat.yale.edu/~hz68/619/Stein-1961.pdf).

[^brown]: Lawrence D. Brown, "Admissibility of Invariant Estimators of One or More Location Parameters," *The Annals of Mathematical Statistics*, 1966. [PDF](https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Admissibility-of-invariant-estimators-of-one-or-more-location-parameters.pdf).

[^efron-morris-1972]: Bradley Efron and Carl Morris, "Stein's Estimation Rule and its Competitors: An Empirical Bayes Approach," Stanford Technical Report, 1972. [Stanford report page](https://statistics.stanford.edu/technical-reports/steins-estimation-rule-and-its-competitors-empirical-bayes-approach).

[^efron-morris-1975]: Bradley Efron and Carl Morris, "Data Analysis Using Stein's Estimator and its Generalizations," *Journal of the American Statistical Association*, 1975. [PDF](https://faculty.ucmerced.edu/jvevea/classes/290_21/readings/week%204/Efron%20and%20Morris.pdf).
