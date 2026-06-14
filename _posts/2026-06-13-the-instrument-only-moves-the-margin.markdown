---
layout: post
title: "Instruments Move the Margin"
description: "Instrumental variables do not recover the effect for everyone. Under strong assumptions, they recover the effect for people whose treatment was moved by the instrument."
date: 2026-06-13 19:25:00 -0400
categories: statistics
tags: [instrumental-variables, causal-inference, econometrics, late, weak-instruments, experimentation]
excerpt: "An instrument is not a substitute treatment. It is a randomized nudge, and the ratio it identifies belongs to the people who were nudged."
---

An instrument is not a proxy.

It is not a clever variable that "stands in" for treatment. It is not a secret
back door through confounding. It is a tiny experiment embedded inside a messy
world.

The clean story has three variables:

- $$Z$$: an encouragement, assignment, eligibility rule, lottery number, distance,
  calendar cutoff, or other source of exogenous variation;
- $$D$$: the treatment people actually take;
- $$Y$$: the outcome.

The instrument changes treatment for some people. Then we ask how much the
outcome changes per unit of treatment induced by the instrument:

$$
\frac{E[Y\mid Z=1]-E[Y\mid Z=0]}
{E[D\mid Z=1]-E[D\mid Z=0]}.
$$

That ratio is the Wald estimand for a binary instrument. In a simple one
instrument, one treatment, no-covariate setting, it is also the two-stage least
squares coefficient.

The numerator is the reduced form. The denominator is the first stage. The
quotient is the causal claim.

Every term in that sentence can fail.

## The Margin

Imagine a randomized email encouraging people to use a tutoring service. Some
people use tutoring whether or not they receive the email. Some never use it.
Some use it only if encouraged. Maybe a few perversely avoid it when encouraged.

These are principal strata:

- **always-takers**: $$D(0)=1,\ D(1)=1$$;
- **never-takers**: $$D(0)=0,\ D(1)=0$$;
- **compliers**: $$D(0)=0,\ D(1)=1$$;
- **defiers**: $$D(0)=1,\ D(1)=0$$.

Only compliers move in the intended direction when $$Z$$ changes from 0 to 1.
Always-takers and never-takers help define the world, but the instrument does
not reveal their treatment effect. They are observed in only one treatment state.

Imbens and Angrist's local average treatment effect result says that, under
independence, relevance, exclusion, and monotonicity, the IV estimand identifies
the average treatment effect for compliers.[^imbens-angrist] Angrist, Imbens,
and Rubin put the same idea into the potential-outcomes language of compliance
types: the data are directly informative about the effect for the people whose
treatment status the instrument changes.[^air]

That is both powerful and humbling:

```text
the instrument estimates the effect on the moved margin
```

The margin may be exactly the group you care about. Or not.

## A Synthetic Encouragement Trial

The lab below creates an encouragement design. The hidden population has
always-takers, never-takers, compliers, and optional defiers. Treatment effects
can differ by type. A latent variable affects both baseline outcomes and the
principal strata, so the naive treated-control difference is confounded. The
instrument $$Z$$ is randomized.

The chart compares:

- the true population average treatment effect;
- the true complier effect;
- the noiseless IV target implied by the current assumptions;
- the naive difference in outcomes by received treatment;
- the observed Wald estimate.

<div id="iv-lab" class="iv-lab" data-iv-lab>
  <div class="iv-lab__controls">
    <label>
      Sample size: <output data-value="n">1.2k</output>
      <input type="range" min="200" max="4000" step="100" value="1200" data-param="n">
    </label>
    <label>
      Experiments: <output data-value="experiments">120</output>
      <input type="range" min="60" max="240" step="20" value="120" data-param="experiments">
    </label>
    <label>
      Compliers: <output data-value="compliers">30.0%</output>
      <input type="range" min="5" max="70" step="5" value="30" data-param="compliers">
    </label>
    <label>
      Always-takers: <output data-value="always">20.0%</output>
      <input type="range" min="0" max="45" step="5" value="20" data-param="always">
    </label>
    <label>
      Defiers: <output data-value="defiers">0.0%</output>
      <input type="range" min="0" max="30" step="2" value="0" data-param="defiers">
    </label>
    <label>
      Confounding: <output data-value="confounding">100.0%</output>
      <input type="range" min="0" max="200" step="10" value="100" data-param="confounding">
    </label>
    <label>
      Effect heterogeneity: <output data-value="heterogeneity">100.0%</output>
      <input type="range" min="0" max="180" step="10" value="100" data-param="heterogeneity">
    </label>
    <label>
      Direct Z effect: <output data-value="exclusion">0.0</output>
      <input type="range" min="0" max="80" step="5" value="0" data-param="exclusion">
    </label>
  </div>
  <div class="iv-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Instrumental variables simulator showing compliance strata, naive and Wald estimates, first-stage diagnostics, and repeated-sample volatility"></canvas>
  <div class="iv-lab__legend">
    <span><i style="background:#0f766e"></i> Compliers</span>
    <span><i style="background:#9333ea"></i> Always-takers</span>
    <span><i style="background:#94a3b8"></i> Never-takers</span>
    <span><i style="background:#ea580c"></i> Defiers</span>
    <span><i style="background:#2563eb"></i> Wald</span>
  </div>
  <p class="iv-lab__note">
    Deterministic synthetic encouragement design. The instrument is randomized.
    Confounding changes who tends to be an always-taker or never-taker and shifts
    baseline outcomes. The "target" is the noiseless Wald estimand implied by the
    current population, so it includes exclusion leaks or defiers when present.
  </p>
</div>
<script defer src="{{ '/assets/js/instrumental-variable-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the naive treated-control comparison is too large. That
is because treatment receipt is not randomized: the people who take treatment are
not drawn from the same latent baseline-outcome distribution as the people who do
not. The instrument, however, is randomized. Under zero direct effect and zero
defiers, the noiseless IV target equals the complier effect.

Now lower **Compliers** toward 5%. The first stage shrinks. The repeated-sample
histogram widens. The same reduced-form noise is being divided by a smaller
denominator, so the ratio becomes unstable.

Set **Direct Z effect** above zero. The instrument now changes the outcome even
for people whose treatment did not change. The target moves away from the
complier effect. This is an exclusion violation, not a weak-instrument problem.
A huge first stage would not fix it.

Set **Defiers** above zero. Monotonicity breaks. Some people move opposite the
encouragement. The Wald ratio is no longer a simple average for compliers. It is
a contrast between effects on people pushed into treatment and people pushed out
of treatment.

The sliders are intentionally separate because the assumptions are separate.

## The Four Promises

A valid instrument needs at least four promises.

First, **independence**: the instrument is as-if randomly assigned with respect to
potential outcomes and potential treatments. In a randomized encouragement
design this is often plausible by construction. In an observational natural
experiment it is the hardest part of the story.

Second, **relevance**: the instrument changes treatment. This is the first stage.
If encouragement does not move behavior, the ratio has no useful denominator.

Third, **exclusion**: the instrument affects the outcome only through treatment.
If the email changes motivation, stigma, information, or access to other
services, then the reduced form mixes treatment and non-treatment channels.
Baiocchi, Cheng, and Small's tutorial states this condition plainly: the valid
instrument affects outcome only indirectly through treatment.[^baiocchi]

Fourth, **monotonicity**: there are no defiers, or at least no people who move in
the opposite direction of the instrument. This turns the first stage into a
complier share rather than a net of compliers minus defiers.

The theorem is not "find something correlated with treatment."

The theorem is closer to:

```text
randomly move treatment for one margin, and do not move the outcome any other way
```

That is a much sharper object.

## Weak Instruments Are Ratio Trouble

Weak instruments are easy to describe and hard to forgive.

If the first stage is small, the Wald estimator divides by a noisy number near
zero. Even a valid instrument can then produce estimates with strange finite
sample behavior. Bound, Jaeger, and Baker emphasized that weak instruments can
lead to large inconsistencies when the instrument is even weakly related to the
structural error, and that finite-sample IV estimates drift toward OLS as the
first-stage relationship weakens.[^bound] They recommended routinely reporting
first-stage diagnostics such as the partial $$R^2$$ and $$F$$ statistic.

Staiger and Stock developed weak-instrument asymptotics for settings where the
instrument-endogenous-variable correlation is local to zero, showing that
standard large-sample approximations can be badly misleading.[^staiger-stock]

In the lab, set **Compliers** low and **Defiers** slightly above zero. The
first-stage $$F$$ falls and the repeated-sample Wald distribution becomes wide
and sometimes absurd. That is not numerical bad luck. It is the geometry of a
ratio estimator with a fragile denominator.

Large samples help, but not as much as people wish if the first stage is tiny or
the instrument is even slightly invalid. A million observations do not turn a
nearly irrelevant encouragement into a strong experiment.

## Why IV Estimates Often Look Bigger

Instrumental-variable estimates can be larger than ordinary least squares
estimates without either estimate being "wrong" in the same sense.

Card's college-proximity study found that proximity-induced schooling gains were
concentrated among men with less-educated parents, and IV estimates of the return
to schooling were higher than conventional OLS estimates.[^card] One
interpretation is local: the return for students induced by nearby college access
may differ from the average return for everyone.

Angrist and Krueger's quarter-of-birth study used compulsory-schooling laws and
school-start timing as an instrument for education.[^ak] Whether one likes that
instrument or worries about weakness and validity, the conceptual point remains:
IV is not automatically an estimate of the universal return to schooling. It is
about the people whose schooling was shifted by that source of variation.

This is not a defect. It is the price of credible identification.

If a policy will operate through a similar margin, the local effect may be exactly
what you need. If the policy will target a different population, it may not be.

## Reading an IV Paper

When I read an instrumental-variable design, I want the paper to answer:

- What is the instrument, treatment, and outcome?
- Why should the instrument be independent of potential outcomes?
- What is the first stage, in levels, not just significance stars?
- Who are the likely compliers?
- Why is exclusion credible?
- What channels would violate exclusion?
- Why is monotonicity credible?
- Are defiers behaviorally impossible or merely assumed away?
- How weak-instrument-robust is the inference?
- Is the reported effect useful for the policy margin being discussed?

The most revealing question is "who moved?" If the author cannot describe the
compliers, the estimate has no face.

## The Bit to Remember

Instrumental variables are not causal alchemy. They are accounting for a
particular randomized push.

The reduced form tells you how the push changed the outcome. The first stage
tells you how the push changed treatment. The ratio tells you the outcome change
per induced treatment change. Under independence, exclusion, and monotonicity,
that ratio belongs to compliers.

So the next time an IV estimate appears, do not ask first whether it is larger or
smaller than OLS. Ask:

```text
which people did the instrument actually move?
```

That is where the causal effect lives.

## Primary Sources

[^imbens-angrist]: Guido W. Imbens and Joshua D. Angrist, ["Identification and Estimation of Local Average Treatment Effects"](https://eclass.uoa.gr/modules/document/file.php/ECON261/Randomized%20evaluation%20papers/Imbens%20%26%20Angrist%20-%20LATE.pdf), *Econometrica*, 1994. DOI: [10.2307/2951620](https://doi.org/10.2307/2951620).

[^air]: Joshua D. Angrist, Guido W. Imbens, and Donald B. Rubin, ["Identification of Causal Effects Using Instrumental Variables"](https://www.math.mcgill.ca/dstephens/AngristIV1996-JASA-Combined.pdf), *Journal of the American Statistical Association*, 1996. DOI: [10.1080/01621459.1996.10476902](https://doi.org/10.1080/01621459.1996.10476902).

[^baiocchi]: Michael Baiocchi, Jing Cheng, and Dylan S. Small, ["Instrumental Variable Methods for Causal Inference"](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/07/Tutorials_in_Biostatistics_Instrumental_Variable_Methods_for_Causal_Inference.pdf), *Statistics in Medicine*, 2014. DOI: [10.1002/sim.6128](https://doi.org/10.1002/sim.6128).

[^bound]: John Bound, David A. Jaeger, and Regina M. Baker, ["Problems with Instrumental Variables Estimation When the Correlation Between the Instruments and the Endogenous Explanatory Variable Is Weak"](https://research-portal.st-andrews.ac.uk/en/publications/problems-with-instrumental-variables-estimation-when-the-correlat/), *Journal of the American Statistical Association*, 1995. DOI: [10.2307/2291055](https://doi.org/10.2307/2291055).

[^staiger-stock]: Douglas Staiger and James H. Stock, ["Instrumental Variables Regression with Weak Instruments"](https://econpapers.repec.org/article/ecmemetrp/v_3a65_3ay_3a1997_3ai_3a3_3ap_3a557-586.htm), *Econometrica*, 1997.

[^card]: David Card, ["Using Geographic Variation in College Proximity to Estimate the Return to Schooling"](https://ideas.repec.org/p/nbr/nberwo/4483.html), NBER Working Paper 4483, 1993; later published in *Aspects of Labour Market Behaviour*, 1995. PDF: [davidcard.berkeley.edu](https://davidcard.berkeley.edu/papers/geo_var_schooling.pdf).

[^ak]: Joshua D. Angrist and Alan B. Krueger, ["Does Compulsory School Attendance Affect Schooling and Earnings?"](https://ideas.repec.org/a/oup/qjecon/v106y1991i4p979-1014..html), *Quarterly Journal of Economics*, 1991. NBER working paper: [w3572](https://www.nber.org/system/files/working_papers/w3572/w3572.pdf).
