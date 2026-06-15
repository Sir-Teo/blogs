---
layout: post
title: "Dashboards Can Change the Experiment"
description: "A fixed-horizon p-value is a different object once the team checks it every morning and ships the first good-looking day."
date: 2026-06-13 04:08:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [ab-testing, sequential-testing, p-values, experimentation, statistics, psychology]
excerpt: "Optional stopping is not a character flaw. It is a different experiment. Once the team can stop when the graph looks good, the stopping rule belongs in the math."
---

Here is the smallest product ritual that breaks a lot of experiments.

The team launches an A/B test on Monday. The dashboard says not significant.
Tuesday, not significant. Wednesday, close. Thursday morning, the treatment
crosses $$p < 0.05$$. Everyone is tired of waiting. Ship it.

No one lied. No one fabricated data. No one even ran twenty hidden subgroup
analyses. They just watched the experiment while it was running and stopped when
the number became persuasive.

The problem is that a fixed-horizon p-value was asked to do a sequential job.

If the analysis plan was "collect exactly 12,000 users per arm, then test once,"
the usual p-value has one meaning. If the actual plan was "look every morning
and stop if the p-value crosses 0.05," then the statistical object is no longer
the final p-value. It is the event

$$
\min_{1 \le k \le K} p_k \le 0.05.
$$

That event is easier to trigger than $$p_K \le 0.05$$. The p-values across looks
are correlated, so the inflation is not exactly $$1-(1-\alpha)^K$$, but the
direction is not subtle. More looks mean more chances for noise to briefly look
like knowledge.

This post is about that little change of object.

## The Stop Button Is Part of the Test

A fixed-sample test has a terminal decision:

```text
look once after N observations
reject or do not reject
```

A sequential experiment has a boundary:

```text
after each look, decide whether to stop, continue, or give up
```

Wald's sequential probability ratio test made this distinction explicit long
before web experimentation existed: a sequential test is a rule for deciding at
each stage whether enough evidence has accumulated.[^wald] Clinical trials
developed group sequential methods for the same reason. If a treatment is
clearly harmful or clearly beneficial, waiting until the planned final sample
can be unethical. Pocock proposed repeated significance tests with adjusted
boundaries.[^pocock] Lan and DeMets introduced alpha-spending functions so that
the allowable Type I error could be spent over time more flexibly.[^landemets]

That history matters because it says the right lesson is not "never look."

The lesson is:

```text
if you want to look repeatedly, design a test that is allowed to be looked at
repeatedly
```

Peeking is only a bug when the analysis pretends it did not happen.

## Dashboard in a Box

The lab below simulates binary A/B tests. Control has conversion rate $$p_A$$.
Treatment has conversion rate $$p_B = p_A + \Delta$$. At each look, the lab runs
a one-sided normal approximation for the treatment being better than control.

Four policies compete:

1. **Fixed horizon:** ignore all interim looks and test once at the end.
2. **Naive peeking:** stop at the first look where $$p \le \alpha$$.
3. **Bonferroni looks:** stop if $$p \le \alpha/K$$ at any of $$K$$ looks.
4. **OBF-style boundary:** stop if the z-statistic crosses a simple
   O'Brien-Fleming-style boundary, high early and lower later.

The OBF rule here is an educational normal approximation, not a replacement for
a production group-sequential design library. It is included because the shape
is the important lesson: a valid sequential design makes early stopping harder
than final stopping.

<div class="peeking-lab" data-peeking-lab>
  <div class="peeking-lab__controls">
    <label>
      Baseline conversion: <output data-value="baseRate">8%</output>
      <input type="range" min="1" max="30" step="1" value="8" data-param="baseRate">
    </label>
    <label>
      True lift: <output data-value="lift">0.00 pp</output>
      <input type="range" min="0" max="120" step="5" value="0" data-param="lift">
    </label>
    <label>
      Users per arm: <output data-value="maxUsers">12000</output>
      <input type="range" min="1000" max="50000" step="1000" value="12000" data-param="maxUsers">
    </label>
    <label>
      Looks: <output data-value="looks">20</output>
      <input type="range" min="1" max="60" step="1" value="20" data-param="looks">
    </label>
    <label>
      Alpha: <output data-value="alpha">5%</output>
      <input type="range" min="1" max="10" step="1" value="5" data-param="alpha">
    </label>
    <label>
      Simulations: <output data-value="sims">800</output>
      <input type="range" min="200" max="1500" step="100" value="800" data-param="sims">
    </label>
  </div>
  <div class="peeking-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="590" aria-label="Sequential A/B testing simulator showing p-value paths, false positive rates, stopping costs, and winner's curse"></canvas>
  <div class="peeking-lab__legend">
    <span><i style="background:#64748b"></i> Fixed horizon</span>
    <span><i style="background:#be123c"></i> Naive peeking</span>
    <span><i style="background:#2563eb"></i> Bonferroni looks</span>
    <span><i style="background:#0f766e"></i> OBF-style boundary</span>
  </div>
  <p class="peeking-lab__note">
    Deterministic Monte Carlo experiment. Each simulated test has equal traffic
    in control and treatment, Bernoulli outcomes, one-sided z-tests for
    treatment improvement, and a pre-set maximum sample size.
  </p>
</div>
<script defer src="{{ '/assets/js/peeking-lab.js' | relative_url }}"></script>

Start with true lift at zero. This is an A/A test: treatment and control are
the same. A valid 5% fixed-horizon test should reject about 5% of the time,
up to Monte Carlo noise and the normal approximation. The naive peeking policy
often rejects much more often because it asks a different question:

```text
did noise ever look significant?
```

That is not the same as:

```text
was the final statistic significant?
```

Now increase the number of looks. The naive false-positive rate usually climbs.
Bonferroni stays conservative because it pays for every look as if the looks
were independent. The OBF-style boundary spends little error early, then becomes
less strict near the final analysis.

Finally, set a real positive lift. Naive peeking often has higher detection
rate and earlier stopping. That is the temptation. But look at the "winner's
estimate." The tests that stop early tend to be the ones where the observed
effect got lucky. The shipped lift is often larger than the true lift. This is
the same selection problem that makes early backtests look beautiful: the
winner was selected partly for noise.

## Peeking Is Math, Not Morality

The word "peeking" makes the problem sound psychological. Psychology matters,
but the statistical issue is mechanical.

Under a fixed design, the Type I error statement is about one planned rejection
event:

$$
\Pr_{H_0}(p_N \le \alpha) \le \alpha.
$$

Under optional stopping, the rejection event is:

$$
\Pr_{H_0}(\exists k \le K: p_k \le \alpha).
$$

Those are different events. A p-value that is valid at a fixed time is not
automatically valid under a data-dependent stopping time. Johari, Pekelis, and
Walsh put this directly in the context of A/B testing: traditional p-values and
confidence intervals become unreliable when users choose sample sizes
endogenously by continuously monitoring results.[^johari]

Always-valid inference is one answer. It constructs p-values or confidence
sequences that remain valid whenever the user decides to stop. The interface
matches the behavior: users can monitor continuously because the statistic was
designed for continuous monitoring.

Group sequential designs are another answer. They do not say "look whenever."
They say "here are the planned looks and the boundaries." The experiment is
allowed to stop early because the early stopping rule was priced into the error
budget.

The bad design is the hybrid:

```text
act sequentially, analyze as fixed horizon
```

That is the bug.

## The Product Garden of Forking Paths

Simmons, Nelson, and Simonsohn showed how undisclosed flexibility in data
collection, analysis, and reporting can make false-positive findings much more
likely than the nominal alpha level suggests.[^simmons] Gelman and Loken's
"garden of forking paths" gives the broader version: even without conscious
fishing, analysis choices can be contingent on the observed data, so the final
reported comparison inherits a hidden multiple-comparisons problem.[^gelman]

Product experiments have their own garden:

1. stop when significant;
2. extend when almost significant;
3. switch the primary metric after launch;
4. inspect segments until one tells a story;
5. remove "bad" days after an incident;
6. ignore guardrails when the main metric wins;
7. call the test inconclusive only after the lift fades.

Some of these choices are defensible in exploratory work. Production teams need
diagnosis, not ritual purity. The problem is labeling an adaptive exploration
as a confirmatory test.

The ASA statement on p-values is careful about this point: p-values do not
measure the probability that the hypothesis is true, and scientific conclusions
should not rest only on whether a threshold was crossed.[^asa] In experiments,
I would add a more operational rule:

```text
the p-value is only interpretable together with the path that produced it
```

A result with $$p=0.04$$ after one planned look is not the same evidence as
$$p=0.04$$ after twenty unreported looks and three metric changes.

## The Audit Trail I Want

Before trusting an experiment dashboard, I want the following fields in the
experiment record:

1. the primary metric and guardrail metrics;
2. the maximum sample size or the sequential stopping rule;
3. the schedule of looks;
4. the alpha-spending or always-valid method, if monitoring is allowed;
5. the decision rule for success, harm, and futility;
6. all analysis changes after launch;
7. the number of segments inspected before the narrative was chosen.

This is not bureaucracy. It is the denominator of the evidence.

If the test is exploratory, call it exploratory. Let the team look freely, learn
where the metric moved, and generate a new hypothesis. Then run the confirmatory
test with a decision rule that matches the intended behavior.

If the test is meant to ship a product change, the stopping rule should be part
of the product spec. A dashboard that encourages daily monitoring should not
display fixed-horizon p-values as if no one will use them sequentially.

## Add the Product Costs

The next version of the lab should add two things.

First, confidence sequences. Always-valid intervals would let the reader watch
an interval shrink over time while preserving coverage under optional stopping.
That would make the difference between "valid now" and "valid at the end" more
visual than a p-value path.

Second, decision cost. A product team rarely cares only about Type I error. It
cares about shipping bad changes, delaying good ones, losing users during the
test, and burning engineering attention. The right sequential design should be
chosen against that loss function, not against statistical aesthetics alone.

That is the deeper point. Sequential testing is not a loophole in fixed-sample
testing. It is a different design problem.

Peeking does not corrupt an experiment by being curious. It corrupts the
experiment when curiosity is hidden from the math.

## Paper Trail

[^wald]: Abraham Wald, "Sequential Tests of Statistical Hypotheses," *The Annals of Mathematical Statistics*, 1945. [JSTOR](https://www.jstor.org/stable/2235829).

[^pocock]: Stuart J. Pocock, "Group Sequential Methods in the Design and Analysis of Clinical Trials," *Biometrika*, 1977. [Oxford Academic](https://academic.oup.com/biomet/article/64/2/191/384776).

[^landemets]: K. K. Gordon Lan and David L. DeMets, "Discrete Sequential Boundaries for Clinical Trials," *Biometrika*, 1983. [Oxford Academic](https://academic.oup.com/biomet/article-abstract/70/3/659/247777).

[^johari]: Ramesh Johari, Leo Pekelis, and David J. Walsh, "Always Valid Inference: Continuous Monitoring of A/B Tests," *Operations Research*, 2022. [INFORMS](https://dl.acm.org/doi/10.1287/opre.2021.2135), earlier version: "Always Valid Inference: Bringing Sequential Analysis to A/B Testing," 2015. [arXiv](https://arxiv.org/abs/1512.04922).

[^simmons]: Joseph P. Simmons, Leif D. Nelson, and Uri Simonsohn, "False-Positive Psychology: Undisclosed Flexibility in Data Collection and Analysis Allows Presenting Anything as Significant," *Psychological Science*, 2011. [PubMed](https://pubmed.ncbi.nlm.nih.gov/22006061/).

[^gelman]: Andrew Gelman and Eric Loken, "The Garden of Forking Paths: Why Multiple Comparisons Can Be a Problem, Even When There Is No Fishing Expedition or p-Hacking and the Research Hypothesis Was Posited Ahead of Time," 2013. [PDF](https://sites.stat.columbia.edu/gelman/research/unpublished/p_hacking.pdf).

[^asa]: Ronald L. Wasserstein and Nicole A. Lazar, "The ASA Statement on p-Values: Context, Process, and Purpose," *The American Statistician*, 2016. [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/00031305.2016.1154108).
