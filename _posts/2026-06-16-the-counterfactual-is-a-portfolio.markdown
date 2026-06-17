---
layout: post
title: "The Counterfactual Is a Portfolio"
description: "Synthetic control builds a missing no-treatment path as a weighted portfolio of untreated units. The weights are transparent; the causal claim is not automatic."
date: 2026-06-16 21:04:00 -0400
categories: statistics
tags: [synthetic-control, causal-inference, panel-data, counterfactuals, econometrics, policy-evaluation, statistics]
excerpt: "A synthetic control is not just a smoother control group. It is a constrained portfolio of donors asked to replay the treated unit before treatment, then carry that resemblance into the missing future."
---

A treated unit has two futures, but the data only show one.

California passes a tobacco control law. A country reunifies. A product changes
pricing. A city opens a transit line. A trading venue changes a fee schedule.
After the intervention, the treated series moves. The hard question is not:

```text
what happened next?
```

The hard question is:

```text
what would have happened here without the intervention?
```

Synthetic control answers with a portfolio.

It says: find nonnegative weights on untreated donor units,

$$
w_j \ge 0,\qquad \sum_j w_j = 1,
$$

so that the weighted donor path matches the treated unit before the
intervention. Then carry the same weights forward:

$$
\widehat{Y}_{1t}(0)=\sum_{j=2}^{J+1} w_j Y_{jt}.
$$

The estimated treatment effect after time $$T_0$$ is the observed treated path
minus that synthetic path.

This is wonderfully concrete. It is also easy to overtrust.

The weights are transparent. The causal claim is a design claim.

## Build The Missing Path

The lab below creates a small panel. One unit is treated after the vertical
line. The donor pool is generated from shared latent factors. The browser fits
a synthetic control by minimizing pre-treatment squared error subject to the
simplex constraint: no negative donor weights and no total weight above one.

The simulation keeps the hidden no-treatment path, so the lab can show the
thing real studies cannot see: whether the synthetic counterfactual actually
tracks the missing future.

<style>
  .sc-lab {
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

  .sc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .sc-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sc-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .sc-lab input,
  .sc-lab select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .sc-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .sc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .sc-lab__metric span,
  .sc-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sc-lab__metric span {
    display: block;
  }

  .sc-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .sc-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sc-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="synthetic-control-lab" class="sc-lab" data-synthetic-control-lab>
  <div class="sc-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="policy" selected>single policy</option>
        <option value="product">product launch</option>
        <option value="macro">macro shock</option>
      </select>
    </label>
    <label>
      Donors: <output data-value="donors">10</output>
      <input type="range" min="5" max="12" step="1" value="10" data-param="donors">
    </label>
    <label>
      Pre-period: <output data-value="pre">40</output>
      <input type="range" min="24" max="58" step="1" value="40" data-param="pre">
    </label>
    <label>
      Effect size: <output data-value="effect">30%</output>
      <input type="range" min="-28" max="40" step="1" value="30" data-param="effect">
    </label>
    <label>
      Fit difficulty: <output data-value="fitGap">18%</output>
      <input type="range" min="0" max="70" step="1" value="18" data-param="fitGap">
    </label>
    <label>
      Donor spillover: <output data-value="leakage">0%</output>
      <input type="range" min="0" max="65" step="1" value="0" data-param="leakage">
    </label>
    <label>
      Noise: <output data-value="noise">8%</output>
      <input type="range" min="0" max="30" step="1" value="8" data-param="noise">
    </label>
    <label>
      Seed: <output data-value="seed">53</output>
      <input type="range" min="1" max="997" step="1" value="53" data-param="seed">
    </label>
  </div>
  <div class="sc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Synthetic control lab showing treated and synthetic paths, treatment gaps, donor weights, placebo donor gaps, and diagnostics"></canvas>
  <p class="sc-lab__note">
    Deterministic browser experiment. The fitted weights are projected onto the
    simplex after each gradient step, so the synthetic control is a convex
    combination of donor units rather than an unconstrained regression.
  </p>
</div>
<script defer src="{{ '/assets/js/synthetic-control-lab.js?v=20260616a' | relative_url }}"></script>

In the default run, the true average post-treatment effect is about `2.74`.
The synthetic-control estimate is about `3.24`. The pre-treatment RMSPE is
about `0.65`, and the post-period error against the hidden counterfactual path
is about `0.86`.

Those are not magic numbers. They are receipts.

The lab is showing three things at once:

- how well the donor portfolio replayed the treated unit before treatment;
- how large the post-treatment gap becomes;
- whether donor-as-treated placebos produce gaps of similar size.

Now move **Donor spillover** upward.

The estimated effect collapses. At `45%` spillover in the default setup, the
estimate falls to about `1.67` even though the true effect remains about
`2.74`. The reason is not mysterious: the donor pool is no longer untreated.
The synthetic counterfactual has been partly treated too.

Synthetic control is a beautiful estimator only after the donor pool earns its
name.

## Why The Simplex Matters

Unconstrained regression can match a pre-period by borrowing negative weights,
large positive weights, and cancellations:

```text
2.7 Spain - 1.9 Portugal + 0.2 France
```

That may predict well, but it is no longer a transparent comparison unit. It is
an extrapolation device.

The original synthetic-control design restricts donor weights to be nonnegative
and sum to one. Abadie and Gardeazabal used that idea in the Basque Country
conflict study, where the counterfactual region was built as a weighted
combination of Spanish regions.[^abadie-gardeazabal] Abadie, Diamond, and
Hainmueller then developed the California tobacco application and the modern
comparative-case-study framing.[^adh2010]

The simplex is not a technicality. It says:

```text
the treated unit should be rebuilt from the donor support, not from leverage
outside it
```

That is why a bad pre-treatment fit is not merely ugly. It is evidence that the
treated unit may not live inside the donor pool's convex hull. If the pre-period
cannot be reconstructed, the missing post-period deserves suspicion.

Move **Fit difficulty** upward. The treated unit gets a latent component that
the donors cannot span. The optimizer still returns weights summing to one, but
the pre-fit worsens and the post-period counterfactual can drift away from the
truth.

The method did not fail silently. The pre-period told you.

## Placebos Are Not Decoration

The treated unit has no observed no-treatment future. Donors do.

A standard synthetic-control falsification exercise pretends each donor was
treated, rebuilds it from the other donors, and asks how large its post-period
gap looks. This is not a conventional large-sample standard error. It is closer
to a permutation-style question:

```text
does the treated unit look unusual relative to units that should not have an
effect?
```

Abadie, Diamond, and Hainmueller emphasized these placebo-style inferential
exercises because comparative case studies often have few aggregate units and
do not fit the assumptions behind routine regression standard errors.[^adh2010]
The later comparative-politics paper popularized related gap and RMSPE-ratio
plots for applied work.[^adh2015]

The lab's **placebo tail** is deliberately crude: it counts how many donor
placebo average gaps are at least as large as the treated gap, with a small
finite-sample correction. It is a visual audit, not a theorem.

Still, the discipline matters. A policy effect that looks dramatic only because
every donor also gets dramatic placebo gaps is weaker evidence than the same
gap in a calm donor pool.

## The Timing Line Does Work

Synthetic control is a panel-data design. The pre-period is not a warm-up. It is
where the counterfactual earns credibility.

With too little pre-treatment history, many donor portfolios can look plausible.
With more history, accidental matches become harder. But more history is not
automatically better if the structural relationship changes before treatment,
measurement definitions drift, or old data come from a different regime.

The intervention date also has to be real. If analysts search over many
possible start dates and report the one with the prettiest gap, the placebo
logic must account for that search. A gap is less surprising after the analyst
has tried many calendars.

This is one of the reasons Abadie's 2021 review reads synthetic controls as a
research-design method, not just an estimator. It discusses feasibility,
settings where the design is credible, and settings where it can fail.[^abadie2021]

The estimator is a computation. The design is the argument.

## Difference-in-Differences Is Hiding Nearby

Difference-in-differences asks for parallel trends. Synthetic control asks for a
weighted donor path that matches the treated path before treatment.

Those are cousins.

If the synthetic-control weights are uniform and the pre-period is summarized
only by a common trend, the method starts to look like difference-in-differences.
If donor weights are chosen to match the treated unit's whole pre-period path,
the method becomes more individualized and more visibly diagnostic.

Arkhangelsky, Athey, Hirshberg, Imbens, and Wager made the relationship explicit
with synthetic difference-in-differences, an estimator that combines unit
weights and time weights to borrow robustness from both traditions.[^sdid]

This is the useful mental map:

```text
DiD: compare trends after differencing away stable level differences
SCM: build a donor portfolio that already looks like the treated unit
SDID: weight units and time periods to stabilize the comparison
```

The methods differ, but they share the same causal anxiety: the untreated future
is missing.

## What I Would Put In The Report

A synthetic-control result should not arrive as one line on a slide.

I would want to see:

- the donor pool and exclusions;
- the fitted donor weights;
- the pre-treatment fit, not just the post-treatment gap;
- sensitivity to donor removal;
- placebo gaps for donor-as-treated units;
- RMSPE ratios or another scale-aware placebo comparison;
- robustness to the intervention date and pre-period window;
- evidence that donors were not exposed to spillovers;
- a substantive reason the treated unit belongs in the donor support.

The last item is easy to skip because the optimizer produces numbers either
way. But a convex combination of bad donors is still bad evidence. It is just
bad evidence with weights.

## The Portfolio Is Not The Proof

Synthetic control has an unusually honest interface. It gives you a picture,
weights, a pre-fit, and placebo diagnostics. It lets readers ask why donor 3
received weight and donor 7 did not. It exposes extrapolation by forbidding most
of it.

That honesty is not the same as causal validity.

The donor pool must be untreated. The pre-period must be informative. The
treated unit must be reproducible from donors for reasons that should persist
after the intervention. The timing must not be chosen after seeing the gap. The
post-treatment divergence must be unusual relative to credible placebos.

The counterfactual is a portfolio.

The portfolio is evidence only if the research design makes it one.

## Paper Trail

[^abadie-gardeazabal]: Alberto Abadie and Javier Gardeazabal, ["The Economic Costs of Conflict: A Case Study of the Basque Country"](https://www.aeaweb.org/articles?id=10.1257%2F000282803321455188), *American Economic Review*, 2003. Author PDF: [MIT](https://economics.mit.edu/sites/default/files/publications/The%20Economic%20Costs%20of%20Conflict.pdf).

[^adh2010]: Alberto Abadie, Alexis Diamond, and Jens Hainmueller, ["Synthetic Control Methods for Comparative Case Studies: Estimating the Effect of California's Tobacco Control Program"](https://economics.mit.edu/sites/default/files/publications/Synthetic%20Control%20Methods.pdf), *Journal of the American Statistical Association*, 2010.

[^adh2015]: Alberto Abadie, Alexis Diamond, and Jens Hainmueller, ["Comparative Politics and the Synthetic Control Method"](https://economics.mit.edu/sites/default/files/publications/Comparative%20Politics%20and%20the%20Synthetic%20Control.pdf), *American Journal of Political Science*, 2015.

[^abadie2021]: Alberto Abadie, ["Using Synthetic Controls: Feasibility, Data Requirements, and Methodological Aspects"](https://www.aeaweb.org/articles?id=10.1257%2Fjel.20191450), *Journal of Economic Literature*, 2021.

[^sdid]: Dmitry Arkhangelsky, Susan Athey, David A. Hirshberg, Guido W. Imbens, and Stefan Wager, ["Synthetic Difference-in-Differences"](https://www.aeaweb.org/articles?id=10.1257%2Faer.20190159), *American Economic Review*, 2021.
