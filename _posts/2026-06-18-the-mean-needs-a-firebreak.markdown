---
layout: post
title: "The Mean Needs a Firebreak"
description: "Median-of-means estimates a mean by splitting samples into blocks, averaging locally, and letting the median discard a few damaged blocks."
date: 2026-06-18 02:26:00 -0400
categories: statistics
tags: [median-of-means, robust-statistics, heavy-tails, mean-estimation, monte-carlo, statistics]
excerpt: "A sample mean lets one wild observation speak to every decimal place. Median-of-means puts firebreaks between blocks before taking the center."
---

The sample mean has a beautiful flaw.

It shares everything.

That is exactly why it is efficient for Gaussian noise. Every observation gets
the same vote, and the votes average down cleanly. It is also why one absurd
draw can move the final number by an absurd amount. The estimator has no
internal bulkhead. If a measurement is wild enough, the whole average hears it.

Median-of-means is a small structural change:

```text
split the data into blocks
average inside each block
take the median of those block averages
```

The block mean is still allowed to be ordinary and efficient most of the time.
The median is the firebreak. A few ruined blocks do not get to speak for the
whole sample.

This is not a universal "robustness wins" story. It is a high-confidence mean
estimation story. The estimator is useful when the target is still the mean,
but the distribution may have heavy tails, rare gross errors, or variance that
is too visible for asymptotic comfort.

## The Construction Is Almost Embarrassingly Small

Given observations $$X_1,\ldots,X_n$$, choose an odd number of blocks $$k$$.
Split the observations into blocks $$B_1,\ldots,B_k$$ of roughly equal size and
compute:

$$
\bar{X}_j
= \frac{1}{|B_j|}
\sum_{i \in B_j} X_i.
$$

Then return:

$$
\hat{\mu}_{\mathrm{MOM}}
= \mathrm{median}
\left(
\bar{X}_1,\ldots,\bar{X}_k
\right).
$$

That is the whole estimator.

The point of the block count is easy to say and easy to misuse. If $$k$$ is too
small, the median has too few chances to reject bad blocks. If $$k$$ is too
large, each block mean has too little data and becomes noisy. In the usual
analysis, $$k$$ is a confidence knob: more blocks buy a smaller failure
probability, but the block size pays for it.

A sketch gives the right feel. Suppose the observations are independent with
mean $$\mu$$ and variance $$\sigma^2$$. If a block has size about $$m=n/k$$,
Chebyshev's inequality says that one block mean is usually within a constant
multiple of:

$$
\sigma \sqrt{\frac{k}{n}}.
$$

The median fails only if at least half the blocks are bad. Independent blocks
turn that majority event into an exponentially small probability in $$k$$. Set
$$k$$ proportional to $$\log(1/\delta)$$ and you get a high-probability error
of order:

$$
\sigma \sqrt{\frac{\log(1/\delta)}{n}},
$$

up to constants and feasibility conditions. This is the same confidence shape
as a Gaussian tail bound, but it asks only for finite variance in the
one-dimensional setting.[^lugosi-mendelson]

The constants matter in real work. Catoni-style estimators and later
median-of-means refinements improve parts of this story, especially when one
cares about constants, adaptivity, or multivariate extensions.[^catoni][^minsker]
The simple estimator is still worth understanding because the mechanism is
visible.

## A Lab For Damaged Averages

The browser lab below compares three estimators for a true mean of zero:

- the ordinary sample mean,
- a 10% trimmed mean, and
- median-of-means.

The default scenario is deliberately sharp: 96% of observations are
$$N(0,1)$$, while 4% are drawn from $$N(0,60^2)$$. That is symmetric, so the
true mean is still zero. It is also hostile to a plain average because a few
rare observations carry enormous leverage.

<style>
  .mom-lab {
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

  .mom-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .mom-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .mom-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .mom-lab input,
  .mom-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .mom-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .mom-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .mom-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .mom-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .mom-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.38);
  }

  .mom-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .mom-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.78rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .mom-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .mom-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="mom-lab" data-median-of-means-lab>
  <div class="mom-lab__controls">
    <label>
      Scenario
      <output data-value="scenario">4% gross contamination</output>
      <select data-param="scenario" aria-label="Sampling scenario">
        <option value="contaminated" selected>4% gross contamination</option>
        <option value="gaussian">Gaussian baseline</option>
        <option value="student">Student t, 3 df</option>
        <option value="lognormal">Centered lognormal</option>
        <option value="pareto">Symmetric Pareto tail</option>
      </select>
    </label>
    <label>
      Sample size
      <output data-value="n">120</output>
      <input type="range" min="30" max="360" step="10" value="120" data-param="n" aria-label="Sample size">
    </label>
    <label>
      Blocks
      <output data-value="blocks">9</output>
      <input type="range" min="3" max="31" step="2" value="9" data-param="blocks" aria-label="Median-of-means block count">
    </label>
    <label>
      Repeated samples
      <output data-value="trials">900</output>
      <input type="range" min="200" max="2200" step="100" value="900" data-param="trials" aria-label="Monte Carlo repeated samples">
    </label>
    <label>
      Random seed
      <output data-value="seed">31</output>
      <input type="range" min="1" max="9999" step="1" value="31" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="mom-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Median-of-means lab comparing sample mean, trimmed mean, and median-of-means under heavy-tailed sampling"></canvas>
  <p class="mom-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/median-of-means-lab.js?v=20260618c' | relative_url }}"></script>

## What The Default Run Says

For the default contaminated setting, the deterministic audit run reports:

```text
n = 120
blocks = 9
repeated samples = 900

sample mean p95 absolute error = 2.127
10% trimmed mean p95 error     = 0.204
median-of-means p95 error      = 0.503
MOM / mean p95                 = 0.24
```

That result is evidence about this simulation, not a theorem. It says that for
this symmetric rare-outlier mixture, the sample mean's 95th-percentile error is
about four times the median-of-means error.

It also says something important about interpretation: the trimmed mean wins
this default case. That is not an embarrassment for median-of-means. A fixed
trim is excellent when the contamination is symmetric, obvious, and below the
trim fraction. The MOM advantage is different: it does not require choosing a
numeric clipping threshold, and its proof route is about a majority of block
means being good rather than about identifying individual observations as
outliers.

Change the scenario to the Gaussian baseline and the ordinary mean becomes the
right reference again. In the audit grid, the Gaussian p95 errors are:

| Scenario | n | Blocks | Mean p95 | Trimmed p95 | MOM p95 | MOM / mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4% gross contamination | 120 | 9 | 2.127 | 0.204 | 0.503 | 0.24 |
| Gaussian baseline | 120 | 9 | 0.183 | 0.187 | 0.232 | 1.27 |
| Student t, 3 df | 180 | 11 | 0.141 | 0.105 | 0.159 | 1.12 |
| Centered lognormal | 150 | 9 | 0.159 | 0.262 | 0.171 | 1.08 |
| Symmetric Pareto tail | 180 | 15 | 0.689 | 0.321 | 0.495 | 0.72 |

The rows are deliberately mixed. The lab is not trying to make MOM win every
cell. It is trying to show when the firebreak matters and what it costs.

## Reproducibility Check

The interactive lab is backed by a CommonJS module, so the same deterministic
simulation can run under Node. The sweep reports 35 named checks: seven
finite-summary, block, histogram, contamination, Gaussian-baseline, and
estimator-consistency invariants across five scenarios.

```bash
node - <<'NODE'
const lab = require("./assets/js/median-of-means-lab.js");
const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (audit.total !== 5 || audit.totalChecks !== 35) {
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
  throw new Error(`${summary}: ${JSON.stringify(failed, null, 2)}`);
}
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  n: row.n,
  blocks: row.blocks,
  mean95: row.meanP95.toFixed(3),
  trim95: row.trimmedP95.toFixed(3),
  mom95: row.momP95.toFixed(3),
  ratio: row.momMeanRatio.toFixed(2),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
console.log(summary);
NODE
```

The audit checks that summaries are finite, the displayed median-of-means value
equals the median of the displayed block means, block counts are respected,
histograms keep their fixed bin count, the contamination case really hurts the
plain mean, the Gaussian mean remains competitive, and the trimmed estimator is
finite.

The implementation is intentionally small enough to inspect:
[`assets/js/median-of-means-lab.js`]({{ '/assets/js/median-of-means-lab.js' | relative_url }}).

## The Boundary Of The Trick

Median-of-means is not an outlier detector. It does not tell you which
observations are wrong. It only limits how many block averages can control the
answer.

It also does not rescue a mean that is not the right estimand. If the data come
from a Cauchy distribution, the population mean is not defined. A stable median
of block means may still produce a number, but it is not estimating a
nonexistent mean.

If the contamination is biased and common enough to hit most blocks, MOM will
move too. The firebreak assumes a majority of block means remain informative.
That is weaker than assuming every observation is polite, but it is still an
assumption.

Finally, block construction matters. Randomly permuting before splitting is a
good habit when the input order might carry bursts or time dependence. If the
data are serially correlated, clustered, or adversarially ordered, treating
contiguous blocks as independent evidence is a modeling choice, not a law of
nature.

The best practical reading is:

```text
use the sample mean when the tails are tame enough
use a firebreak when rare blocks can be awful
keep the audit visible either way
```

[^lugosi-mendelson]: Gabor Lugosi and Shahar Mendelson, ["Mean estimation and regression under heavy-tailed distributions--a survey"](https://arxiv.org/abs/1906.04280), 2019.

[^catoni]: Olivier Catoni, ["Challenging the empirical mean and empirical variance: a deviation study"](https://arxiv.org/abs/1009.2048), 2010, revised 2011.

[^minsker]: Stanislav Minsker, ["Efficient median of means estimator"](https://proceedings.mlr.press/v195/minsker23a.html), Proceedings of Machine Learning Research 195, 2023.
