---
layout: post
title: "If You Keep Looking, Use a Bankroll"
description: "E-values and e-processes turn sequential evidence into a nonnegative martingale, so repeated looks become part of the design instead of a loophole."
date: 2026-06-13 21:15:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [e-values, e-processes, martingales, anytime-valid-inference, sequential-testing, ab-testing]
excerpt: "A fixed-horizon p-value is a snapshot. An e-process is a bankroll: under the null, it should be hard to get rich no matter when the dashboard stops."
---

A fixed-horizon p-value is a snapshot.

It asks: if the null were true and the sample size had been chosen in advance,
how surprising is a statistic at this sample size?

That is a perfectly good question. It is also not the question many teams ask in
real life.

Real experiments are watched. Dashboards refresh. A/B tests are stopped early
when they look exciting, extended when they look ambiguous, sliced after someone
notices an odd subgroup, and revived when a stakeholder asks for "just one more
week." The peeking is not always malicious. Often it is how organizations
operate.

The statistical object has to know whether it is being used as a snapshot or as
an alarm someone is allowed to watch.

An e-process is a process.

## Bankroll Rule

An e-value is a nonnegative random variable $$E$$ such that, under every
distribution in the null hypothesis,

$$
\mathbb{E}_0[E] \le 1.
$$

Large values are evidence against the null. If $$E \ge 20$$, you can reject at
level $$0.05$$, because Markov's inequality gives

$$
P_0(E \ge 1/\alpha) \le \alpha.
$$

That is the one-shot story.

The sequential story replaces one random variable with a nonnegative process
$$(E_t)_{t \ge 0}$$ that starts at one and behaves like a supermartingale under
the null:

$$
\mathbb{E}_0[E_t \mid \mathcal{F}_{t-1}] \le E_{t-1}.
$$

Ville's inequality says

$$
P_0\left(\sup_t E_t \ge 1/\alpha\right) \le \alpha.
$$

This is the whole charm. If the null is true, the evidence process may bounce
around, but it is hard to become rich by repeatedly checking it. Jean Ville's
1939 work was one of the origins of this martingale view of probability.[^ville]
Modern e-values and e-processes put it directly into statistical testing.[^vovk-wang],
[^savi]

The phrase "testing by betting" is not decorative.[^shafer] The evidence is a
bankroll. A valid test is a fair or unfavorable game under the null. If you get
very rich, the null has some explaining to do.

## A Fair Coin Casino

Suppose we observe binary outcomes $$X_t \in \{0,1\}$$. The null hypothesis is
that the success probability is $$1/2$$. Before seeing $$X_t$$, choose a bet size
$$\lambda_t \in [-2,2]$$, possibly based on the past. Define the one-step
multiplier

$$
F_t = 1 + \lambda_t(X_t - 1/2).
$$

When $$X_t=1$$, the multiplier is $$1+\lambda_t/2$$. When $$X_t=0$$, it is
$$1-\lambda_t/2$$. The range restriction keeps the multiplier nonnegative.

Under the null,

$$
\mathbb{E}_0[F_t \mid \mathcal{F}_{t-1}]
= 1.
$$

Therefore

$$
E_t = \prod_{i=1}^t F_i
$$

is a nonnegative martingale under the null. The test is simple:

```text
reject when E_t >= 1/alpha
```

No fixed sample size is needed for validity. The stopping rule can depend on the
data, on the calendar, on a dashboard, or on boredom, as long as the betting
process itself was valid.

This does not mean the bet is automatically powerful. A bad betting strategy is
still valid, but it may grow slowly or lose money under the alternative. Validity
comes from fairness under the null. Power comes from choosing a game that the
alternative is likely to win.

## Peeking Lab With a Bankroll

The lab below compares two things:

1. an e-process built from the fair coin betting multiplier above;
2. a deliberately naive "peek at the usual one-sided normal p-value after every
   observation" rule.

The p-value line is included as a diagnostic foil, not as a recommendation. The
point is to show the difference between a statistic designed for optional
stopping and a fixed-horizon statistic used as an always-on alarm.

<style>
  .eprocess-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .eprocess-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  }

  .eprocess-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .eprocess-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .eprocess-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .eprocess-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .eprocess-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .eprocess-lab__metric span,
  .eprocess-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .eprocess-lab__metric span {
    display: block;
  }

  .eprocess-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .eprocess-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .eprocess-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="eprocess-betting-lab" class="eprocess-lab" data-eprocess-lab>
  <div class="eprocess-lab__controls">
    <label>
      True success rate: <output data-value="trueRate">56%</output>
      <input type="range" min="50" max="70" step="1" value="56" data-param="trueRate">
    </label>
    <label>
      Bet size: <output data-value="bet">0.30</output>
      <input type="range" min="0" max="180" step="5" value="30" data-param="bet">
    </label>
    <label>
      Horizon: <output data-value="horizon">500</output>
      <input type="range" min="80" max="1600" step="20" value="500" data-param="horizon">
    </label>
    <label>
      Alpha: <output data-value="alpha">5%</output>
      <input type="range" min="1" max="20" step="1" value="5" data-param="alpha">
    </label>
    <label>
      Seed: <output data-value="seed">23</output>
      <input type="range" min="1" max="99" step="1" value="23" data-param="seed">
    </label>
  </div>
  <div class="eprocess-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="E-process betting simulator comparing anytime-valid e-process crossings with repeated fixed-horizon p-value peeking"></canvas>
  <p class="eprocess-lab__note">
    Deterministic toy: 360 null paths and 360 alternative paths. The p-value
    peeking rule uses a one-sided normal approximation after time 20. It is a
    foil for the anytime-valid e-process, not a calibrated sequential test.
  </p>
</div>
<script defer src="{{ '/assets/js/eprocess-betting-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, $$\alpha=0.05$$, so the e-boundary is $$1/\alpha=20$$.
The deterministic null audit gives:

```text
null e-process crossing rate     about 4.4%
null repeated p-value crossing   about 33.1%
```

That is the optional stopping story in one line. The e-process was built as an
always-on alarm. The fixed-horizon p-value was not.

Under the alternative, where the true success rate is 56%, the e-process crosses
in about 68.9% of paths by 500 observations. The median final e-value is about
29.3. The median e-crossing time among crossed paths is about 214 observations.

Move **True success rate** down to 50%. The e-process is still valid, but a
positive bet is now poorly aimed. The median final e-value collapses, because
the game is fair under the null and the chosen bet has no edge.

Move **Bet size**. A bigger bet can grow faster when the alternative is right,
but it also loses faster when the early evidence points the other way. The
bet-size panel shows expected log growth under the chosen alternative. The
orange vertical line is the log-optimal fixed bet for this simple Bernoulli
game. Validity does not require using that bet. Power cares a lot.

Move **Horizon**. The null e-crossing rate stays around the alpha line, while
the naive repeated p-value alarm accumulates false chances. The exact
deterministic percentages wiggle because the lab uses a finite set of simulated
paths, but the structural difference is the point.

Move **Alpha**. The e-boundary changes from $$20$$ at 5% to $$100$$ at 1%.
Evidence has a price: stronger error control requires a larger bankroll
multiple before stopping.

## Safe Means Matching the Use

"Safe" does not mean "always conservative" or "always more powerful." It means
the error guarantee survives the way the statistic is used.

For an e-process,

$$
P_0(\exists t : E_t \ge 1/\alpha) \le \alpha.
$$

This permits continuous monitoring. It also permits stopping after seeing the
data. The test threshold was designed for the maximum over time.

For a fixed-horizon p-value, the guarantee is different:

$$
P_0(p_T \le \alpha) \le \alpha
$$

at a pre-specified time $$T$$. If you look at $$p_t$$ at many times and stop when
one looks good, the event is no longer $$p_T \le \alpha$$. It is

$$
\min_{t \le T} p_t \le \alpha.
$$

That is a different statistic with a different null distribution.

This is why the p-value is not the villain. The misuse is asking a snapshot to
behave like a process.

## The Game Still Needs Design

E-values do not remove all design judgment.

They force the judgment into the game.

You still have to decide:

- what null hypothesis the game is fair against;
- which observations are allowed to arrive adaptively;
- what betting strategy is predictable from the past;
- whether the strategy has power against the alternatives that matter;
- how to report evidence that rises and later falls;
- how to combine evidence across experiments, metrics, or subgroups.

The modern safe anytime-valid inference literature is largely about this design
space: constructing useful e-processes, confidence sequences, and betting
strategies that remain valid at arbitrary stopping times.[^howard], [^ramdas]

The design question is not "Can I peek?" It is:

```text
what process am I allowed to peek at?
```

## Dashboard Translation

For experimentation platforms, I would like dashboards to separate three
objects:

1. **Fixed-horizon analysis.** Use this when the sample size and analysis date
   are genuinely pre-committed.
2. **Sequential alarms.** Use e-processes, confidence sequences, alpha-spending,
   or another sequential design when monitoring is part of the workflow.
3. **Exploration.** Label subgroup searches, metric browsing, and retrospective
   slicing as exploration unless their error guarantees include that behavior.

The win is not only mathematical hygiene. It is communication.

An e-process says: "If the null were right, this bankroll should not get this
large very often, even if we watched it all along."

That sentence is easier to operationalize than a p-value that quietly assumes a
different experiment from the one the team actually ran.

Evidence can be a snapshot.

But when people keep watching, evidence should be a process.

[^ville]: Jean Ville, [*Etude critique de la notion de collectif*](https://www.numdam.org/item/THESE_1939__218__1_0.pdf), Gauthier-Villars, 1939. A useful English discussion of Ville's counterexample is available from Shafer and Vovk's probability and finance project: ["A Counterexample to Richard von Mises's Theory of Collectives"](https://www.probabilityandfinance.com/misc/ville1939.pdf).

[^vovk-wang]: Vladimir Vovk and Ruodu Wang, ["E-values: Calibration, combination, and applications"](https://arxiv.org/abs/1912.06116), *Annals of Statistics*, 2021.

[^savi]: Aaditya Ramdas, Peter Grunwald, Vladimir Vovk, and Glenn Shafer, ["Game-Theoretic Statistics and Safe Anytime-Valid Inference"](https://arxiv.org/abs/2210.01948), *Statistical Science*, 2023.

[^shafer]: Glenn Shafer, ["Testing by betting: A strategy for statistical and scientific communication"](https://ideas.repec.org/a/bla/jorssa/v184y2021i2p407-431.html), *Journal of the Royal Statistical Society: Series A*, 2021.

[^howard]: Steven R. Howard, Aaditya Ramdas, Jon McAuliffe, and Jasjeet Sekhon, ["Time-uniform, nonparametric, nonasymptotic confidence sequences"](https://arxiv.org/abs/1810.08240), *Annals of Statistics*, 2021. See also ["Time-uniform Chernoff bounds via nonnegative supermartingales"](https://arxiv.org/abs/1808.03204), *Probability Surveys*, 2020.

[^ramdas]: Aaditya Ramdas, Johannes Ruf, Martin Larsson, and Wouter Koolen, ["Admissible anytime-valid sequential inference must rely on nonnegative martingales"](https://arxiv.org/abs/2009.03167), arXiv 2020.
