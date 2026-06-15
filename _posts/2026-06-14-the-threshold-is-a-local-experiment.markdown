---
layout: post
title: "Thresholds Only Speak Nearby"
description: "Regression discontinuity turns a hard rule into a narrow causal comparison. The useful question is not whether the rule is sharp, but whether anything else jumps at the same line."
date: 2026-06-14 13:15:00 -0400
categories: statistics
tags: [regression-discontinuity, causal-inference, econometrics, bandwidth, local-linear-regression, diagnostics]
excerpt: "A cutoff can look like a tiny randomized experiment, but only at the boundary and only if people cannot precisely sort around it."
---

Some of the cleanest experiments are not announced as experiments.

They are announced as rules:

```text
score at least 70 to pass
win at least 50 percent of the vote
ship the feature only to accounts over the eligibility score
send applications above the risk threshold to manual review
```

The rule is discontinuous. One side gets something. The other side does not.
The people just above and just below the line can look almost interchangeable.
That is the seduction of regression discontinuity.

It is also the danger.

A threshold is not a magic causal wand. It does not say that everyone above the
line is comparable to everyone below the line. It does not say that the policy
effect far from the threshold is identified. It does not rescue a rule that
people can game precisely. It gives something narrower and more useful:

```text
near the cutoff, if all other determinants vary smoothly,
the jump in outcomes can be read as the jump caused by treatment.
```

That sentence is small, but it is a loaded small sentence. It contains the
estimand, the design assumption, the reason the plot matters, and the reason the
plot can lie.

## The Not-A-Regression Part

Let $$X_i$$ be the running variable: a score, vote share, age, model risk score,
latency percentile, or any continuous quantity that decides treatment. Let the
cutoff be $$c$$. In a sharp regression discontinuity design,

$$
W_i = 1\{X_i \ge c\},
$$

where $$W_i = 1$$ means the unit receives the treatment.

The object people usually want is not the all-population average treatment
effect. The object RD identifies is local:

$$
\tau_\mathrm{RD}
= \lim_{x \downarrow c} E[Y_i \mid X_i=x]
- \lim_{x \uparrow c} E[Y_i \mid X_i=x].
$$

Under continuity of the potential-outcome regression functions at the cutoff,
this observed jump equals the average treatment effect at the boundary:

$$
\tau_\mathrm{RD}
= E[Y_i(1)-Y_i(0) \mid X_i=c].
$$

This is why the method feels so unusually transparent. You draw the outcome
against the running variable, fit the two sides separately, and ask what jumps
at exactly the place where treatment jumps. Imbens and Lemieux's guide frames
the design this way: assignment is determined at least partly by a covariate
lying on either side of a fixed threshold, and a discontinuity in the conditional
expectation at the cutoff is interpreted as treatment evidence when the relevant
counterfactual functions are smooth there.[^imbens-lemieux]

The phrase "at the cutoff" is not decorative. In a sharp RD there is no ordinary
overlap away from the cutoff. If $$X<c$$, everyone is untreated. If $$X\ge c$$,
everyone is treated. The comparison comes from extrapolating each side's
conditional mean to the boundary. As Imbens and Lemieux emphasize, the needed
extrapolation can be made arbitrarily small in large samples, but it is still
extrapolation.[^imbens-lemieux]

That is the reason a regression discontinuity is more design than regression.
The regression is just the measuring instrument. The design is the argument that
nothing else important has a cliff at the same point.

## A Cutoff Lab

The lab below creates a synthetic sharp RD. Each point has an unobserved ability
term, a smooth relationship between the running variable and the untreated
outcome, and a treatment that turns on at zero. The default planted treatment
effect at the cutoff is `1.00`.

With the default seed, the local-linear estimate is about `1.05`, while the
naive all-data treated-minus-control gap is about `1.39`. The naive gap is too
large because it compares broad groups that differ in the running variable. The
RD fit tries to compare what the two curves would have been right at the line.

The manipulation slider is the trapdoor. Raise it and some high-ability units
just left of the threshold sort to the right. The outcome jump may still look
clean, but the diagnostic panels start to complain: the density of the running
variable jumps and a pretreatment covariate jumps too.

I audited the lab before rewriting. The default local-linear estimate is 1.049
with standard error 0.118, against a planted cutoff effect of 1.00; the local
mean gap is 1.140 and the naive all-data gap is 1.394. With manipulation at
70%, 34 units sort across the line, the density log jump rises to 0.569, and
the covariate jump rises to 0.303. A 2,187-case sweep over bandwidth, curvature,
effect size, manipulation, noise, sample size, and seed produced finite local
fits with enough observations on both sides in every case. I also fixed the lab
to export through `module.exports`, matching the other audited labs.

<style>
  .rd-lab {
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

  .rd-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
  }

  .rd-lab__controls label,
  .rd-lab__metric span,
  .rd-lab__note,
  .rd-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .rd-lab__controls label {
    display: grid;
    font-weight: 650;
    gap: 0.35rem;
    min-width: 0;
  }

  .rd-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .rd-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .rd-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rd-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .rd-lab__metric span {
    display: block;
  }

  .rd-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .rd-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 840px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .rd-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .rd-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rd-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .rd-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .rd-lab {
      padding: 0.82rem;
    }

    .rd-lab__controls,
    .rd-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .rd-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="rd-lab" data-regression-discontinuity-lab>
  <div class="rd-lab__controls">
    <label>
      Bandwidth <output data-value="bandwidth">0.32</output>
      <input type="range" min="8" max="80" step="1" value="32" data-param="bandwidth">
    </label>
    <label>
      Curvature <output data-value="curvature">45%</output>
      <input type="range" min="0" max="100" step="1" value="45" data-param="curvature">
    </label>
    <label>
      Cutoff effect <output data-value="effect">1.00</output>
      <input type="range" min="0" max="180" step="5" value="100" data-param="effect">
    </label>
    <label>
      Manipulation <output data-value="manipulation">0%</output>
      <input type="range" min="0" max="90" step="1" value="0" data-param="manipulation">
    </label>
    <label>
      Noise <output data-value="noise">0.32</output>
      <input type="range" min="5" max="90" step="1" value="32" data-param="noise">
    </label>
    <label>
      Units <output data-value="samples">1200</output>
      <input type="range" min="400" max="2600" step="100" value="1200" data-param="samples">
    </label>
    <label>
      Seed <output data-value="seed">47</output>
      <input type="range" min="1" max="999" step="1" value="47" data-param="seed">
    </label>
  </div>
  <div class="rd-lab__metrics" data-rd-metrics></div>
  <canvas data-canvas width="980" height="840" aria-label="Regression discontinuity simulator showing local fits, bandwidth sensitivity, running-variable density, and diagnostic jumps"></canvas>
  <div class="rd-lab__legend">
    <span><i style="background:#2563eb"></i> Left of cutoff</span>
    <span><i style="background:#be123c"></i> Right of cutoff</span>
    <span><i style="background:#0f766e"></i> Local fit</span>
    <span><i style="background:#d97706"></i> Sorted units</span>
  </div>
  <p class="rd-lab__note">
    Deterministic toy simulation. The local-linear estimate uses separate
    triangular-kernel fits on each side of the cutoff. The density panel is a
    McCrary-style diagnostic intuition, not a formal density test or robust RD
    inference procedure.
  </p>
</div>
<script defer src="{{ '/assets/js/regression-discontinuity-lab.js?v=20260614b' | relative_url }}"></script>

The lab is intentionally simple enough to inspect. In
[`assets/js/regression-discontinuity-lab.js`]({{ '/assets/js/regression-discontinuity-lab.js' | relative_url }}),
the outcome is generated from a smooth baseline plus a discontinuous treatment
effect:

```text
observed outcome = smooth baseline(latent running variable, ability)
                   + treatment effect * 1{observed running variable >= 0}
                   + noise
```

The local estimator fits a line on the left and another line on the right using
only observations inside the bandwidth. The reported RD estimate is the gap
between those two fitted intercepts at zero.

That is most of RD in one sentence. It is also where most RD mistakes begin.

## Bandwidth Is How Much Extrapolation You Buy

The bandwidth slider controls how much of the world you allow to speak for the
boundary.

A tiny bandwidth uses only the closest observations. That sounds pure, but it
can be noisy because very few points remain. A huge bandwidth has lower variance
but lets far-away curvature leak into the estimate. In the lab, increasing
curvature makes this trade visible: local means can drift badly as the window
widens, while local linear fits are more stable because they let each side have
its own slope.

This is why RD papers should not report one heroic number and disappear. A
credible analysis usually shows a graph, a main bandwidth choice, sensitivity to
neighboring bandwidths, covariate balance checks, and a careful inference
procedure. Imbens and Lemieux recommend graphical analysis, local linear
methods close to the discontinuity, bandwidth discussion, and specification
checks including covariate and density discontinuities.[^imbens-lemieux]

The confidence interval is not a formatting detail. Local-polynomial RD
estimators have boundary bias, and bandwidths chosen to optimize mean squared
error are not automatically valid for conventional confidence intervals.
Calonico, Cattaneo, and Titiunik developed robust bias-corrected confidence
intervals that explicitly address this problem and are implemented in the
standard RD software ecosystem.[^cct]

The toy lab does not implement those intervals. It is doing something more
modest: letting the bias-variance trade move under your hand.

## The Rule Can Create Its Own Confounder

Suppose a scholarship goes to students with scores at least 70.

If students have noisy control over the score, then the students at 69.9 and
70.1 may be almost exchangeable. Lee and Lemieux describe the key intuition:
when individuals cannot precisely control the assignment variable near the
cutoff, treatment variation near the threshold is "as good as randomized."[^lee-lemieux]

Now change the story. Suppose students can retake the test until they barely
cross 70, or teachers can round favored students upward, or applicants can
submit documentation that moves a score only when it matters. The running
variable is no longer a smooth sorting device. It has become an object of
strategic behavior.

That is what the manipulation slider simulates. Some high-ability units who
would have landed just left of the threshold appear just right of it. The
outcome jump now contains two things:

```text
treatment effect
+ discontinuous change in who appears on each side
```

The scary part is that the first scatterplot may still look persuasive. The
break is sharp. The estimate may even be close to the planted effect in some
seeds. But the design is damaged because pretreatment variables have changed
discontinuously at the threshold.

There are two classic smoke alarms:

- **Covariate continuity.** Variables determined before treatment should not
  jump at the cutoff. If age, prior achievement, prior spend, credit history, or
  baseline risk jumps, the comparison is not clean.
- **Running-variable density continuity.** The number of units should not bunch
  strangely just above or below the cutoff. McCrary's density test formalizes
  this manipulation check for the running variable.[^mccrary]

Neither smoke alarm proves validity when it stays quiet. A manipulator could
move both observed and unobserved variables in ways you cannot detect. But if a
pretreatment covariate jumps, or the running variable piles up on one side of
the line, the RD story has to be rebuilt from institutional detail rather than
saved by prettier regression.

## A Threshold Checklist

When I see an RD claim, I want to know five things before I care about the
coefficient.

First, who controls the running variable?

A birth date, vote share, timestamp, queue position, or physical measurement may
have different manipulation risks. A model score, application score, or human
review score may inherit every incentive in the system. The question is not
"can anyone influence it?" Lee and Lemieux are explicit that some influence can
exist. The question is whether agents can precisely sort around the threshold.

Second, what else changes at the same cutoff?

Production systems love bundling. A fraud score above 0.9 may trigger manual
review, a different notification, a logging path, a stricter timeout, and a
different escalation team. A school cutoff may change remediation, teacher
attention, parental behavior, and peer grouping at once. RD estimates the jump
caused by the bundle that actually changes at the boundary, not by the label you
wrote on the policy.

Third, is the estimand local enough to answer the question?

The effect of barely passing an exam is not necessarily the effect of passing
for students who were always far above the bar. The effect of barely winning an
election is not necessarily the effect of landslide victory. The effect of a
manual review threshold near a model score of 0.9 is not necessarily the effect
of manual review for obvious cases near 0.2 or 0.99. Local evidence is often
valuable precisely because it is honest about where it comes from.

Fourth, does the graph use the design rather than decorating the regression?

Plot the raw points or binned means. Let the two sides have separate fits. Do
not smooth through the cutoff. Show the bandwidth. Show sensitivity. If the
estimate lives only inside one polynomial specification, it is not the threshold
doing the work.

Fifth, are the uncertainty claims RD-aware?

Boundary estimation, bandwidth choice, clustering, discrete running variables,
donut holes, multiple thresholds, and specification search can all break a
vanilla standard error. The visual jump can be real while the inferential story
is underbuilt.

## Where This Belongs in ML Systems

Modern ML systems are full of discontinuities wearing product clothing.

A classifier score sends a case to human review. A recommender score opens a
larger candidate pool. A credit model flips an approval. A safety filter changes
the generation policy. A ranking threshold decides whether a creator gets
distribution. A latency score chooses whether to fall back to a smaller model.

These thresholds are tempting RD sites because they are everywhere and because
experimentation is often hard. But ML thresholds are also unusually easy to
misread:

- the score may be stale, calibrated differently by segment, or rounded;
- the threshold may move during incidents;
- users may adapt once they infer the rule;
- human review may change measurement of the outcome;
- other systems may share the same cutoff because it became an operational
  convention.

That does not make RD useless. It makes RD a forcing function for system
understanding. If a team cannot say who controls the score, whether the cutoff
was stable, what else changed at that value, whether baseline covariates are
continuous, and whether there is density bunching, then the model threshold is
not yet a causal design. It is just a branch in code.

The good version is powerful. A system has a long-running, stable threshold. The
running variable is logged before treatment. Units cannot precisely manipulate
their position. No other policy changes at the cutoff. Pretreatment covariates
look smooth. Density looks smooth. Bandwidth sensitivity is boring. The estimate
is explicitly local.

Then the threshold becomes a tiny natural experiment left behind by the
engineering rule.

## The Line Is Not the Evidence

The line is where you look.

The evidence is the argument that the world was smooth there except for the
treatment. The plot is a witness, not a guarantee. The local regression is a
measuring device, not a design by itself. The bandwidth is a declaration about
how much smoothness you are willing to spend.

Regression discontinuity is beautiful because it asks for less than most causal
stories and more than most plots. It asks for a discontinuous rule, a narrow
comparison, and a serious account of why nothing else jumped.

That is not automatic. But when it is true, a threshold is not just a product
rule or administrative artifact. It is a small experiment hiding in public.

[^imbens-lemieux]: Guido Imbens and Thomas Lemieux, ["Regression Discontinuity Designs: A Guide to Practice"](https://www.nber.org/system/files/working_papers/w13039/w13039.pdf), NBER Working Paper 13039, 2007. The paper reviews sharp and fuzzy RD designs, local linear estimation, bandwidth choice, graphical analysis, and tests for covariate and density discontinuities.

[^lee-lemieux]: David S. Lee and Thomas Lemieux, ["Regression Discontinuity Designs in Economics"](https://www.princeton.edu/~davidlee/wp/RDDEconomics.pdf), *Journal of Economic Literature*, 2010. The review develops the local-randomization interpretation when agents cannot precisely manipulate the assignment variable near the cutoff.

[^cct]: Sebastian Calonico, Matias D. Cattaneo, and Rocio Titiunik, ["Robust Nonparametric Confidence Intervals for Regression-Discontinuity Designs"](https://rdpackages.github.io/references/Calonico-Cattaneo-Titiunik_2014_ECMA.pdf), *Econometrica*, 2014.

[^mccrary]: Justin McCrary, ["Manipulation of the running variable in the regression discontinuity design: A density test"](https://ideas.repec.org/a/eee/econom/v142y2008i2p698-714.html), *Journal of Econometrics*, 2008.
