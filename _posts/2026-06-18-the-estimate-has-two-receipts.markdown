---
layout: post
title: "The Estimate Has Two Receipts"
description: "A doubly robust estimator checks an observational causal estimate against both the treatment assignment model and the outcome model. One correct receipt can be enough; two wrong receipts are still wrong."
date: 2026-06-18 05:50:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [doubly-robust-estimation, aipw, causal-inference, propensity-score, missing-data, semiparametrics, statistics]
excerpt: "AIPW looks like a formula with extra plumbing. The plumbing is the point: predict the missing potential outcomes, then let inverse-probability residuals audit those predictions."
---

A causal estimate from observational data needs a receipt for who got into each
line.

One receipt says how treatment was assigned. The other says what each outcome
would have looked like under treatment and control. Doubly robust estimators
ask for both, then make a narrow promise:

```text
if the identification story is true,
and overlap is not broken,
and either the assignment model or the outcome model is right,
the target average can still be recovered
```

That is a powerful sentence. It is also easy to overread. "Doubly robust" does
not mean robust to hidden confounding, post-treatment adjustment, bad overlap,
measurement error, target drift, or two flexible models hallucinating the same
wrong story. It means one of two nuisance receipts can fail without necessarily
destroying the final estimating equation.

This post sits between two earlier notes. [Some Rows Speak for a Crowd]({% post_url 2026-06-15-the-weight-is-a-receipt-for-being-missed %})
covered inverse-probability weighting as representation accounting.
[The Residual Is the Test Section]({% post_url 2026-06-13-the-residual-is-the-experiment %})
covered orthogonal scores and cross-fitting. AIPW is the small, concrete
crossroads: one outcome model, one propensity model, one correction term.

## The Two Single-Receipt Estimators

Let $$A\in\{0,1\}$$ be treatment, $$Y$$ the observed outcome, and $$X$$
pretreatment covariates. The target is the average treatment effect

$$
\tau = \mathbb{E}\{Y(1)-Y(0)\}.
$$

Under consistency, no unmeasured confounding, and overlap,

$$
\{Y(1),Y(0)\}\perp A\mid X,
\qquad
0 < e(X) < 1,
$$

where

$$
e(X)=\Pr(A=1\mid X)
$$

is the propensity score. Rosenbaum and Rubin defined the propensity score as
the conditional probability of assignment to treatment given covariates and
showed why adjusting for that scalar score can balance observed covariates
under strong ignorability.[^rr]

One receipt is therefore the assignment receipt. If $$e(X)$$ is known or well
estimated, inverse-probability weighting estimates the two potential-outcome
means by reweighting the observed arms:

$$
\widehat{\tau}_{IPW}
=
\frac{1}{n}\sum_{i=1}^{n}
\left[
\frac{A_iY_i}{\widehat e(X_i)}
-
\frac{(1-A_i)Y_i}{1-\widehat e(X_i)}
\right].
$$

The other receipt is the outcome receipt. Define

$$
\mu_a(X)=\mathbb{E}[Y\mid A=a,X].
$$

If both outcome regressions are right, standardization estimates

$$
\widehat{\tau}_{OR}
=
\frac{1}{n}\sum_{i=1}^{n}
\{\widehat\mu_1(X_i)-\widehat\mu_0(X_i)\}.
$$

Both approaches can be correct. Both can fail. IPW is exposed to unstable or
misspecified propensities, especially near zero or one. Outcome regression is
exposed to extrapolation: if a region mostly contains treated units, the
control outcome model there is guessing from elsewhere.

The doubly robust move is not to average the two estimates. It is to write one
estimating equation where each receipt audits the other.

## The Augmented Receipt

The augmented inverse-probability weighted estimator is

$$
\widehat{\tau}_{AIPW}
=
\frac{1}{n}\sum_{i=1}^{n}
\left[
\widehat\mu_1(X_i)-\widehat\mu_0(X_i)
+
\frac{A_i}{\widehat e(X_i)}\{Y_i-\widehat\mu_1(X_i)\}
-
\frac{1-A_i}{1-\widehat e(X_i)}\{Y_i-\widehat\mu_0(X_i)\}
\right].
$$

Read it in two layers.

First, impute the missing potential-outcome contrast with the outcome model:

$$
\widehat\mu_1(X_i)-\widehat\mu_0(X_i).
$$

Then add weighted residual receipts for the outcomes you actually saw. A
treated row checks whether the treated-outcome prediction was too low or too
high. A control row does the same for the control-outcome prediction. The
propensity tells each residual how many comparable rows it represents.

Bang and Robins describe the double-robust property this way: in a causal
inference model, a DR estimator remains consistent if either the treatment
assignment mechanism or the counterfactual outcome model is correctly
specified.[^bang-robins] Their paper also traces the AIPW line through earlier
work by Robins, Rotnitzky, and Zhao on semiparametric regression with missing
data.[^rrz]

Here is the useful algebra. Condition on $$X$$. If the outcome model is right,
then

$$
\mathbb{E}[Y-\mu_1(X)\mid A=1,X]=0,
\qquad
\mathbb{E}[Y-\mu_0(X)\mid A=0,X]=0.
$$

The residual terms vanish even if the propensity model is imperfect, as long as
the denominators behave. The first term already gives
$$\mu_1(X)-\mu_0(X)$$.

If the propensity model is right but the outcome model is wrong, write the
wrong predictions as $$m_1(X)$$ and $$m_0(X)$$. The conditional expectation of
the AIPW summand is

$$
m_1(X)-m_0(X)
+
\{\mu_1(X)-m_1(X)\}
-
\{\mu_0(X)-m_0(X)\}
=
\mu_1(X)-\mu_0(X).
$$

The residual receipts cancel the outcome-model error.

That cancellation is the whole mechanism. There is no third receipt for an
unmeasured confounder.

## A Four-Quadrant Bench Test

The lab below creates observational data from a known data-generating process.
Treatment assignment depends on nonlinear functions of two covariates. The
outcome also depends on nonlinear functions of those covariates, plus a
heterogeneous treatment effect. The simulator knows the true ATE; the estimators
see only $$X,A,Y$$.

For the nuisance models:

- "right" outcome models get the same basis functions used by the outcome
  generator;
- "wrong" outcome models get only an intercept and one covariate;
- "right" propensity models get the same basis functions used by treatment
  assignment;
- "wrong" propensity models get only an intercept and one covariate.

This is a parametric toy, not a production causal pipeline. It is useful because
the failure modes are visible.

<style>
  .dr-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .dr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .dr-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .dr-lab__controls input,
  .dr-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    width: 100%;
  }

  .dr-lab__controls select {
    background: #ffffff;
    border: 1px solid #ccd6df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.15rem;
    padding: 0.25rem 0.45rem;
  }

  .dr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .dr-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.05rem;
    padding: 0.62rem 0.68rem;
  }

  .dr-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .dr-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .dr-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .dr-lab__metric span,
  .dr-lab__legend,
  .dr-lab__note {
    color: #5d6872;
    font-size: 0.78rem;
  }

  .dr-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.04rem;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .dr-lab canvas {
    display: block;
    height: 620px;
    max-width: 100%;
    width: 100%;
  }

  .dr-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .dr-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .dr-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .dr-lab__note {
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 560px) {
    .dr-lab {
      padding: 0.85rem;
    }

    .dr-lab canvas {
      height: 820px;
    }
  }
</style>

<div class="dr-lab" data-doubly-robust-lab>
  <div class="dr-lab__controls">
    <label>
      Rows: <output data-value="rows">900</output>
      <input type="range" min="300" max="2400" step="100" value="900" data-param="rows">
    </label>
    <label>
      Confounding: <output data-value="confounding">75%</output>
      <input type="range" min="0" max="120" step="5" value="75" data-param="confounding">
    </label>
    <label>
      Minimum overlap: <output data-value="overlap">8%</output>
      <input type="range" min="2" max="30" step="1" value="8" data-param="overlap">
    </label>
    <label>
      Effect heterogeneity: <output data-value="heterogeneity">70%</output>
      <input type="range" min="0" max="140" step="5" value="70" data-param="heterogeneity">
    </label>
    <label>
      Outcome noise: <output data-value="noise">0.65</output>
      <input type="range" min="20" max="140" step="5" value="65" data-param="noise">
    </label>
    <label>
      Runs: <output data-value="runs">80</output>
      <input type="range" min="24" max="180" step="4" value="80" data-param="runs">
    </label>
    <label>
      Case: <output data-value="scenario">outcome right only</output>
      <select data-param="scenario">
        <option value="both">Both models right</option>
        <option value="outcome" selected>Outcome right only</option>
        <option value="propensity">Propensity right only</option>
        <option value="neither">Both models wrong</option>
      </select>
    </label>
    <label>
      Seed: <output data-value="seed">37</output>
      <input type="range" min="1" max="9999" step="1" value="37" data-param="seed">
    </label>
  </div>
  <div class="dr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Doubly robust AIPW simulator with four nuisance-model quadrants, estimator bias bars, and overlap diagnostics"></canvas>
  <div class="dr-lab__legend">
    <span><i style="background:#be123c"></i> Naive difference</span>
    <span><i style="background:#7c3aed"></i> Outcome regression</span>
    <span><i style="background:#b45309"></i> IPW</span>
    <span><i style="background:#0f766e"></i> AIPW</span>
    <span><i style="background:#2563eb"></i> Treated counts</span>
  </div>
  <p class="dr-lab__note">
    Deterministic simulation. Each run fits ridge outcome models and a logistic
    propensity model. Propensity estimates are clipped to [0.01, 0.99] as a
    numerical guard; clipping is not a substitute for overlap.
  </p>
</div>

<script defer src="{{ '/assets/js/doubly-robust-lab.js?v=20260618c' | relative_url }}"></script>

At the default setting, the true ATE is about `0.550`. Across 80 repeated
samples with 900 rows each:

- **both models right:** AIPW bias is `-0.001`, outcome-regression bias is
  `+0.004`, and IPW bias is `+0.015`;
- **outcome right, propensity wrong:** AIPW bias is `+0.004`, while IPW bias
  rises to `+0.070`;
- **propensity right, outcome wrong:** AIPW bias is `+0.023`, while outcome
  regression bias is `+0.112`;
- **both models wrong:** AIPW bias is `+0.105`.

The naive treated-minus-control comparison is badly confounded in this setup:
its bias is about `+0.500`. It is precise about the wrong contrast.

The source is intentionally inspectable:
[`assets/js/doubly-robust-lab.js`]({{ '/assets/js/doubly-robust-lab.js' | relative_url }}).
Its audit checks finite estimates, the expected four-quadrant robustness shape,
and true-propensity deciles that contain both observed treatment arms.
The current sweep covers eight sample-size, confounding, and overlap settings,
for 24 named checks total.

The sweep is reproducible from Node:

```js
const lab = require("./assets/js/doubly-robust-lab.js");
const EXPECTED_CASES = 8;
const EXPECTED_CHECKS = 24;
const EXPECTED_CHECK_NAMES = [
  "aipw-quadrant-shape",
  "finite-estimates",
  "propensity-deciles-have-both-arms"
];
const EXPECTED_CASE_SHAPE = [
  "600:45:14:40:31:3",
  "600:45:6:40:31:3",
  "600:90:14:40:31:3",
  "600:90:6:40:31:3",
  "900:45:14:40:31:3",
  "900:45:6:40:31:3",
  "900:90:14:40:31:3",
  "900:90:6:40:31:3"
];
const EXPECTED_BIAS_SHAPE = [
  "600:45:14:0.001:0.000:0.002:0.050:0.053",
  "600:45:6:0.006:0.008:0.017:0.069:0.072",
  "600:90:14:-0.028:-0.026:-0.014:0.070:0.080",
  "600:90:6:-0.019:-0.011:-0.015:0.120:0.141",
  "900:45:14:-0.002:-0.001:0.000:0.049:0.051",
  "900:45:6:-0.002:-0.002:-0.007:0.052:0.056",
  "900:90:14:0.001:-0.001:0.013:0.092:0.103",
  "900:90:6:0.006:0.002:0.027:0.108:0.140"
];
const EXPECTED_DECILE_SHAPE = [
  "600:45:14:14:18:0.109:543",
  "600:45:6:9:15:0.048:497",
  "600:90:14:13:13:0.033:419",
  "600:90:6:8:10:0.012:291",
  "900:45:14:22:32:0.087:813",
  "900:45:6:15:24:0.044:753",
  "900:90:14:14:20:0.025:608",
  "900:90:6:4:15:0.010:430"
];
const EXPECTED_CASE_ROWS = [
  "600:45:14:true=0.549:both=0.001:outcome=0.000:propensity=0.002:neither=0.050:orWrong=0.053:arms=14/18:minE=0.109:ess=543:checks=3/3:passed=true",
  "600:45:6:true=0.549:both=0.006:outcome=0.008:propensity=0.017:neither=0.069:orWrong=0.072:arms=9/15:minE=0.048:ess=497:checks=3/3:passed=true",
  "600:90:14:true=0.547:both=-0.028:outcome=-0.026:propensity=-0.014:neither=0.070:orWrong=0.080:arms=13/13:minE=0.033:ess=419:checks=3/3:passed=true",
  "600:90:6:true=0.552:both=-0.019:outcome=-0.011:propensity=-0.015:neither=0.120:orWrong=0.141:arms=8/10:minE=0.012:ess=291:checks=3/3:passed=true",
  "900:45:14:true=0.549:both=-0.002:outcome=-0.001:propensity=0.000:neither=0.049:orWrong=0.051:arms=22/32:minE=0.087:ess=813:checks=3/3:passed=true",
  "900:45:6:true=0.550:both=-0.002:outcome=-0.002:propensity=-0.007:neither=0.052:orWrong=0.056:arms=15/24:minE=0.044:ess=753:checks=3/3:passed=true",
  "900:90:14:true=0.551:both=0.001:outcome=-0.001:propensity=0.013:neither=0.092:orWrong=0.103:arms=14/20:minE=0.025:ess=608:checks=3/3:passed=true",
  "900:90:6:true=0.549:both=0.006:outcome=0.002:propensity=0.027:neither=0.108:orWrong=0.140:arms=4/15:minE=0.010:ess=430:checks=3/3:passed=true"
];
const EXPECTED_CHECK_ROWS = [
  "600:45:14:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "600:45:6:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "600:90:14:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "600:90:6:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "900:45:14:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "900:45:6:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "900:90:14:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true",
  "900:90:6:aipw-quadrant-shape=true|finite-estimates=true|propensity-deciles-have-both-arms=true"
];
const EXPECTED_TOTALS = {
  rows: EXPECTED_CASES,
  passed: EXPECTED_CASES,
  total: EXPECTED_CASES,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS
};

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function formatCaseRow(row) {
  return [
    row.rows,
    row.confounding,
    row.overlap,
    `true=${row.trueAte.toFixed(3)}`,
    `both=${row.aipwBothBias.toFixed(3)}`,
    `outcome=${row.aipwOutcomeBias.toFixed(3)}`,
    `propensity=${row.aipwPropensityBias.toFixed(3)}`,
    `neither=${row.aipwNeitherBias.toFixed(3)}`,
    `orWrong=${row.outcomeRegressionWrongBias.toFixed(3)}`,
    `arms=${row.minDecileTreated}/${row.minDecileControl}`,
    `minE=${row.overlapMinPropensity.toFixed(3)}`,
    `ess=${row.minEffectiveSampleSize.toFixed(0)}`,
    `checks=${row.passedChecks}/${row.totalChecks}`,
    `passed=${row.passed}`
  ].join(":");
}

function formatCheckRow(row) {
  return [
    row.rows,
    row.confounding,
    row.overlap,
    row.checks
      .map((check) => `${check.name}=${check.passed}`)
      .sort()
      .join("|")
  ].join(":");
}

function rowDrifts(actual, expected) {
  return {
    missing: expected.filter((row) => !actual.includes(row)),
    extra: actual.filter((row) => !expected.includes(row))
  };
}

function hasRowDrift(drift) {
  return drift.missing.length > 0 || drift.extra.length > 0;
}

const audit = lab.auditDoublyRobustLab();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);

const auditShape = {
  totals: {
    rows: audit.cases.length,
    passed: audit.passed,
    total: audit.total,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  },
  caseRows: audit.cases.map(formatCaseRow).sort(),
  checkRows: audit.cases.map(formatCheckRow).sort(),
  biasShape: audit.cases.map((row) => [
    row.rows,
    row.confounding,
    row.overlap,
    row.aipwBothBias.toFixed(3),
    row.aipwOutcomeBias.toFixed(3),
    row.aipwPropensityBias.toFixed(3),
    row.aipwNeitherBias.toFixed(3),
    row.outcomeRegressionWrongBias.toFixed(3)
  ].join(":")).sort(),
  caseChecks: audit.cases.map((row) => [
    row.rows,
    row.confounding,
    row.overlap,
    row.runs,
    row.seed,
    row.totalChecks
  ].join(":")).sort(),
  checkNames: Array.from(new Set(audit.cases.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  decileShape: audit.cases.map((row) => [
    row.rows,
    row.confounding,
    row.overlap,
    row.minDecileTreated,
    row.minDecileControl,
    row.overlapMinPropensity.toFixed(3),
    row.minEffectiveSampleSize.toFixed(0)
  ].join(":")).sort()
};
const shapeDrifts = {
  caseRows: rowDrifts(auditShape.caseRows, EXPECTED_CASE_ROWS),
  checkRows: rowDrifts(auditShape.checkRows, EXPECTED_CHECK_ROWS)
};
const shapeErrors = [
  sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameJson(auditShape.caseChecks, EXPECTED_CASE_SHAPE) ? null : "caseChecks",
  sameJson(auditShape.checkNames, EXPECTED_CHECK_NAMES) ? null : "checkNames",
  sameJson(auditShape.biasShape, EXPECTED_BIAS_SHAPE) ? null : "biasShape",
  sameJson(auditShape.decileShape, EXPECTED_DECILE_SHAPE) ? null : "decileShape",
  hasRowDrift(shapeDrifts.caseRows) ? "caseRows" : null,
  hasRowDrift(shapeDrifts.checkRows) ? "checkRows" : null
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `audit shape drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify({ auditShape, shapeDrifts }, null, 2)
  );
}

const summary =
  `${audit.passed}/${audit.total} cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    failed,
    shapeErrors,
    auditShape,
    shapeDrifts,
    passed: audit.passed,
    passedChecks: audit.passedChecks,
    total: audit.total
  }, null, 2));
}

console.table(audit.cases.map((row) => ({
  rows: row.rows,
  confounding: row.confounding,
  overlap: row.overlap,
  checks: `${row.passedChecks}/${row.totalChecks}`,
  aipwBoth: row.aipwBothBias.toFixed(3),
  aipwOutcome: row.aipwOutcomeBias.toFixed(3),
  aipwPropensity: row.aipwPropensityBias.toFixed(3),
  aipwNeither: row.aipwNeitherBias.toFixed(3),
  minDecileArms: `${row.minDecileTreated}/${row.minDecileControl}`,
  minEss: row.minEffectiveSampleSize.toFixed(0),
  minEhat: row.overlapMinPropensity.toFixed(3)
})));
console.log(summary);
```

This is not a proof of double robustness. It is a regression check for the toy
data-generating process used by the figure: if the nuisance-model quadrants stop
having the advertised shape, the post should fail loudly.

## What Breaks the Spell

Kang and Schafer's title is worth keeping close: "Demystifying Double
Robustness." In their incomplete-data simulation, DR methods can help, but
methods using inverse-probability weights remain sensitive when estimated
propensities are small, and two moderately wrong models can still fail.[^kang]

That warning maps directly to causal work.

1. **No hidden-confounding receipt:** If treatment assignment is not ignorable
   after conditioning on $$X$$, the estimator is balancing the wrong ledger.
2. **No overlap receipt:** If some covariate region almost never receives
   treatment or almost never receives control, the residual correction gets
   enormous weights or the outcome model extrapolates.
3. **No two-wrong-model receipt:** If both $$\widehat e$$ and
   $$\widehat\mu_a$$ miss the relevant structure, AIPW can be confidently wrong.
4. **No overfitting receipt:** With flexible nuisance models, same-sample fitting
   can leak noise into the score. Cross-fitting is the usual engineering fix,
   which is why modern double/debiased machine learning treats sample splitting
   as part of the design rather than a cosmetic option.

The estimator has two receipts, not infinite warranty.

## The Run Log I Would Keep

For an observational ATE analysis using AIPW, the artifact should record:

1. the target population and estimand: ATE, ATT, policy value, or something else;
2. the covariates considered pretreatment and why they are sufficient for the
   identification claim;
3. overlap diagnostics, especially tails of estimated propensity scores and
   covariate regions with one treatment arm nearly absent;
4. the outcome models, propensity model, and whether nuisance fits were
   cross-fit;
5. the AIPW estimate alongside OR and IPW estimates, not because disagreement
   invalidates AIPW automatically, but because disagreement is diagnostic;
6. sensitivity analyses for unmeasured confounding and model specification;
7. the exact code that converts rows into estimates.

AIPW is attractive because it turns two modeling stories into one audited
moment equation. It is not attractive because it saves us from telling the
stories.

[^rr]: Paul R. Rosenbaum and Donald B. Rubin, "The central role of the propensity score in observational studies for causal effects," *Biometrika*, 1983. [DOI](https://doi.org/10.1093/biomet/70.1.41).

[^rrz]: James M. Robins, Andrea Rotnitzky, and Lue Ping Zhao, "Analysis of Semiparametric Regression Models for Repeated Outcomes in the Presence of Missing Data," *Journal of the American Statistical Association*, 1995. [DOI](https://doi.org/10.1080/01621459.1995.10476493).

[^bang-robins]: Heejung Bang and James M. Robins, "Doubly Robust Estimation in Missing Data and Causal Inference Models," *Biometrics*, 2005. [DOI](https://doi.org/10.1111/j.1541-0420.2005.00377.x), [PDF](https://www.math.mcgill.ca/dstephens/SISCR2018/Articles/bang_robins_2005.pdf).

[^kang]: Joseph D. Y. Kang and Joseph L. Schafer, "Demystifying Double Robustness: A Comparison of Alternative Strategies for Estimating a Population Mean from Incomplete Data," *Statistical Science*, 2007. [DOI](https://doi.org/10.1214/07-STS227), [arXiv](https://arxiv.org/abs/0804.2958).
