---
layout: post
title: "The Likelihood Ratio Is a Running Score"
description: "A sequential test is not permission to keep refreshing a p-value. It is a pre-committed stopping rule whose state is the accumulated log evidence."
date: 2026-06-15 12:04:00 -0400
categories: statistics
tags: [sequential-analysis, sprt, hypothesis-testing, experimentation, likelihood-ratio, ab-testing, statistics]
excerpt: "Wald's SPRT turns every observation into a small deposit or withdrawal of evidence, then stops only when the ledger hits a predeclared boundary."
---

The most dangerous button in an experiment dashboard is not **ship**.

It is **refresh**.

A fixed-horizon test is a contract: decide the sample size, collect the data,
then test once. When a team keeps checking the same ordinary p-value and stops
as soon as it crosses the line, the contract has been quietly rewritten. The
reported false-positive rate no longer means what the dashboard says it means.

Sequential analysis starts by admitting the obvious: people want to look.

But it does not say "look whenever and pretend nothing changed." It says: if
you want the right to stop early, buy that right in advance. Put the stopping
rule into the design.

Abraham Wald's sequential probability ratio test, or SPRT, is the cleanest
version of that bargain. A sequential test, in Wald's 1945 framing, gives a rule
at each stage for one of three actions: accept the null, reject the null, or keep
sampling.[^wald] That third action is the entire difference. The test is not
waiting for a preordained sample size. It is walking until the evidence is
decisive enough.

## The Score

Suppose observations arrive one at a time. Under hypothesis $$H_0$$ they have
density or mass $$f_0$$. Under hypothesis $$H_1$$ they have density or mass
$$f_1$$. After $$n$$ observations, the likelihood ratio is

$$
\Lambda_n = \prod_{i=1}^{n} \frac{f_1(X_i)}{f_0(X_i)}.
$$

On a log scale this is just a running score:

$$
S_n = \log \Lambda_n
    = \sum_{i=1}^{n} \log \frac{f_1(X_i)}{f_0(X_i)}.
$$

Positive terms favor $$H_1$$. Negative terms favor $$H_0$$. The SPRT stops when
this score hits one of two boundaries:

$$
S_n \ge \log\frac{1-\beta}{\alpha}
\quad \Rightarrow \quad \text{stop for } H_1,
$$

$$
S_n \le \log\frac{\beta}{1-\alpha}
\quad \Rightarrow \quad \text{stop for } H_0.
$$

Here $$\alpha$$ is the type I error budget and $$\beta$$ is the type II error
budget. These are not decorations placed on the result afterward. They are the
rails installed before the train leaves.

For Bernoulli conversion data with $$p_1 > p_0$$, the whole test fits in one
line of code:

```js
llr += success ? Math.log(p1 / p0) : Math.log((1 - p1) / (1 - p0));
```

That line is not computing a p-value. It is updating the odds of two specific
worlds: "the rate is $$p_0$$" versus "the rate is $$p_1$$."

This specificity is why the method is powerful and why it is easy to misuse.
The alternative $$p_1$$ is part of the design. It is the effect size you choose
to care about, not whatever effect happens to look best after the data arrive.

## A Boundary Lab

The lab below simulates an SPRT for Bernoulli observations. The defaults compare
$$p_0 = 0.50$$ with $$p_1 = 0.58$$, using $$\alpha = 0.05$$ and $$\beta = 0.20$$.
The true data-generating rate is also set to `58%`, so the default world is the
alternative the test was designed to detect.

The default boundaries are:

$$
\log((1-\beta)/\alpha) = 2.773,\qquad
\log(\beta/(1-\alpha)) = -1.558.
$$

Each success adds `0.1484` log-likelihood points. Each failure subtracts
`0.1744`. In the deterministic default path, the evidence hits the upper
boundary at observation `124`.

Audited default facts:

- one displayed path: `H1 at n = 124`, final log score `2.911`;
- average stopping time at true rate `58%`: `154.9` observations over `900`
  deterministic Monte Carlo paths;
- stop-for-`H1` rate at true rate `58%`: `78.6%`;
- still open at the hard cap `420`: `3.4%`;
- null diagnostic, simulated at `p = 50%`: `4.9%` stop for `H1` over `2400`
  paths;
- alternative diagnostic, simulated at `p = 58%`: `18.9%` stop for `H0` over
  `2400` paths;
- audit grid: `12 / 12` Bernoulli SPRT configurations passed.

For a slower off-browser check, I also ran `100000` paths with the same default
design: the null stop-for-`H1` rate was `4.53%`, and the alternative stop-for-
`H0` rate was `18.20%`.

<style>
  .sprt-lab {
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

  .sprt-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(134px, 1fr));
  }

  .sprt-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .sprt-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .sprt-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .sprt-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .sprt-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .sprt-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .sprt-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .sprt-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .sprt-lab__legend,
  .sprt-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .sprt-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .sprt-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .sprt-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 680px) {
    .sprt-lab {
      padding: 0.82rem;
    }

    .sprt-lab__controls,
    .sprt-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>

<div class="sprt-lab" data-sprt-lab>
  <div class="sprt-lab__controls">
    <label>
      Null rate <output data-value="p0">50.0%</output>
      <input type="range" data-param="p0" min="10" max="85" step="1" value="50" aria-label="Null rate">
    </label>
    <label>
      Minimum lift <output data-value="lift">8.0%</output>
      <input type="range" data-param="lift" min="1" max="25" step="1" value="8" aria-label="Minimum lift">
    </label>
    <label>
      True rate <output data-value="trueP">58.0%</output>
      <input type="range" data-param="trueP" min="2" max="98" step="1" value="58" aria-label="True rate">
    </label>
    <label>
      Alpha <output data-value="alpha">5.0%</output>
      <input type="range" data-param="alpha" min="1" max="20" step="1" value="5" aria-label="Type I error budget">
    </label>
    <label>
      Beta <output data-value="beta">20.0%</output>
      <input type="range" data-param="beta" min="5" max="40" step="1" value="20" aria-label="Type II error budget">
    </label>
    <label>
      Max observations <output data-value="maxN">420</output>
      <input type="range" data-param="maxN" min="80" max="900" step="20" value="420" aria-label="Maximum observations">
    </label>
    <label>
      Trials <output data-value="trials">900</output>
      <input type="range" data-param="trials" min="200" max="2400" step="100" value="900" aria-label="Monte Carlo trials">
    </label>
    <label>
      Seed <output data-value="seed">73</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="73" aria-label="Random seed">
    </label>
  </div>
  <div class="sprt-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="SPRT lab showing a log-likelihood path, operating characteristic curve, and average sample number curve"></canvas>
  <div class="sprt-lab__legend">
    <span><i style="background:#2563eb"></i> evidence path</span>
    <span><i style="background:#0f766e"></i> stop for H1</span>
    <span><i style="background:#be123c"></i> stop for H0</span>
    <span><i style="background:#7c3aed"></i> operating characteristic</span>
    <span><i style="background:#d97706"></i> average sample number</span>
  </div>
  <p class="sprt-lab__note">
    Deterministic Bernoulli SPRT simulator. The audit checks boundary signs,
    log-likelihood increments, path accounting, error-rate diagnostics, finite
    sample sizes, and operating-characteristic direction across 12 parameter
    cases. Open runs hit the maximum-observation cap without crossing either
    boundary.
  </p>
</div>
<script defer src="{{ '/assets/js/sprt-lab.js?v=20260615a' | relative_url }}"></script>

Set **True rate** between `50%` and `58%`. This is the uncomfortable zone. The
test was designed to separate two points, not to make every nearby effect cheap
to classify. Average sample number rises because the evidence has little drift.

Increase **Minimum lift**. The success and failure increments get larger because
the two hypotheses are farther apart. Decisions come faster, but the test is now
answering a cruder question.

Tighten **Alpha**. The upper boundary moves away. Evidence for shipping has to
travel farther, so the same stream takes longer to call.

## The Operating Characteristic Is the Real Product Spec

The purple curve in the lab is the operating characteristic:

$$
p \mapsto P_p(\text{eventually stop for } H_1).
$$

That curve is more honest than a single "significant or not" label. It tells you
what the procedure does under many possible true rates, not only under the two
rates used to design it.

At $$p_0$$, you want the curve near $$\alpha$$. At $$p_1$$, you want it near
$$1-\beta$$. Between them, there is no miracle. The test has been given an
indifference region, and it behaves like one: sometimes it stops high, sometimes
it stops low, sometimes it needs a long time.

This is why an SPRT should not be sold to product teams as "faster A/B testing"
without the rest of the sentence. It is faster when the data are informative for
the pre-specified contrast. It can be slow when the effect is too small to
separate. It can be wrong when the stream violates the model.

Modern experimentation platforms have reintroduced sequential methods because
ordinary fixed-horizon inference is unreliable under continuous monitoring.
Johari, Pekelis, and Walsh make this point directly in their work on always-valid
inference for A/B tests.[^always-valid] Current product documentation for SPRT
also frames the method as a way to make earlier decisions while accounting for
peeking, not as a loophole around statistical design.[^statsig]

## Wald's Trick Is Also Its Warning Label

The SPRT is beautiful because it collapses a sequential decision into a scalar
ledger. Wald and Wolfowitz later proved a strong optimality result for the SPRT
in the simple-hypothesis setting: under their conditions, it minimizes expected
sample size among competing tests with the same error constraints.[^wald-wolfowitz]

But the same simplicity makes the assumptions visible.

The observations should match the likelihood model. The hypotheses should be
chosen before looking. The stream should not be quietly changing its population
mid-test. Delayed conversions, repeated users, novelty effects, bot traffic,
interference between treatment and control, and metric redefinitions are not
small implementation details. They change the process whose likelihood ratio is
being accumulated.

The hard cap matters too. Pure SPRT theory can run until a boundary is hit. A
real experiment usually has a maximum duration, budget, or traffic quota. The
lab treats capped-but-uncrossed paths as `open`, which is often the right
operational answer: the experiment did not buy enough evidence to make either
pre-registered claim.

That may be unsatisfying. It is also the point. A sequential test is allowed to
stop early, but it is also allowed to tell you that the world was not decisive on
your schedule.

## The Mental Model I Trust

Do not picture a p-value getting refreshed.

Picture a score with two walls.

Before the experiment starts, choose the two worlds worth distinguishing. Choose
the error budgets. Compute the walls. Then each observation moves the score a
little. If it hits the upper wall, the data have bought enough likelihood in
favor of the alternative. If it hits the lower wall, they have bought enough
likelihood in favor of the null. If it wanders, that wandering is information
too.

The refresh button is dangerous when it creates a new test each time you press
it.

It becomes harmless only when the test already knew what pressing refresh was
allowed to mean.

[^wald]: Abraham Wald, ["Sequential Tests of Statistical Hypotheses"](https://doi.org/10.1214/aoms/1177731118), *The Annals of Mathematical Statistics* 16(2):117-186, 1945.
[^wald-wolfowitz]: Abraham Wald and Jacob Wolfowitz, ["Optimum Character of the Sequential Probability Ratio Test"](https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-19/issue-3/Optimum-Character-of-the-Sequential-Probability-Ratio-Test/10.1214/aoms/1177730197.full), *The Annals of Mathematical Statistics* 19(3):326-339, 1948.
[^always-valid]: Ramesh Johari, Leo Pekelis, and David J. Walsh, ["Always Valid Inference: Bringing Sequential Analysis to A/B Testing"](https://arxiv.org/abs/1512.04922), arXiv:1512.04922, 2015; later published as *Operations Research* 70(3):1806-1821.
[^statsig]: Statsig documentation, ["Sequential Probability Ratio Tests"](https://docs.statsig.com/experiments/advanced-setup/sprt), accessed June 15, 2026.
