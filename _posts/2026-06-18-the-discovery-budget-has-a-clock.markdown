---
layout: post
title: "The Discovery Budget Has a Clock"
description: "Online false discovery control is not batch FDR with a refresh button. A stream of tests needs thresholds that are chosen before the next p-value arrives."
date: 2026-06-18 05:29:00 -0400
categories: statistics
series: trustworthy-experiments
tags: [online-fdr, false-discovery-rate, multiple-testing, alpha-investing, experiments, statistics, machine-learning]
excerpt: "Batch FDR sorts a closed list. Online FDR spends and earns error budget in time, where late hypotheses cannot borrow thresholds from tomorrow's p-values."
---

A discovery stream has a clock.

That sounds obvious until the p-values arrive. A batch procedure closes the
family, sorts the list, and draws a line. The previous note on
[false discovery rate control]({% post_url 2026-06-14-discoveries-need-a-denominator %})
was about that closed-list geometry: define the family, sort the p-values, and
publish a discovery list whose expected false fraction is controlled.

But many real search systems do not close. A feature store keeps offering
candidate covariates. A monitoring system keeps emitting anomaly tests. A
research backlog keeps producing variants. A quant researcher keeps trying
signals. An evaluation harness keeps adding prompts and slices. The next
hypothesis arrives after the previous decision, and tomorrow's p-value is not
available for today's threshold.

This changes the object. Online FDR is not:

```text
run BH every morning on everything seen so far
```

That can be a useful dashboard, but it is not the same promise. The online
promise is procedural: before seeing p-value $$p_i$$, choose a level
$$\alpha_i$$ from the past, then reject only if

$$
T_i = 1\{p_i \le \alpha_i\}.
$$

The line has to be chosen while the clock is still at $$i-1$$.

## The Time-Stamped Denominator

Let

$$
D(i) = \sum_{j=1}^{i} T_j
$$

be the number of discoveries made by time $$i$$. For a prefix of the stream,
the realized false discovery proportion is still

$$
\operatorname{FDP}(i) =
\begin{cases}
V(i)/D(i), & D(i) > 0, \\
0, & D(i) = 0,
\end{cases}
$$

where $$V(i)$$ counts rejected true nulls. The online target is to control
$$\operatorname{FDR}(i)=\mathbb{E}[\operatorname{FDP}(i)]$$ over time, not
only after a preselected final batch.

The all-null case shows why raw thresholding is not a stream rule. If every
hypothesis is null and the p-values are independent uniform random variables,
then testing $$n$$ times at level $$q$$ gives

$$
\operatorname{FDR}(n)
=
\Pr\{D(n)>0\}
=
1-(1-q)^n.
$$

At $$q=0.10$$ and $$n=260$$, that number is essentially one. In an all-null
stream, any discovery is false, so the false discovery rate becomes the chance
of ever printing a false headline.

The online problem is to keep using the stream without pretending the stream is
a closed batch.

## Spending Is Safe and Hungry

The blunt answer is alpha-spending. Choose nonnegative numbers
$$\gamma_1,\gamma_2,\ldots$$ with

$$
\sum_{i=1}^{\infty} \gamma_i \le 1,
$$

and test at

$$
\alpha_i = q\gamma_i.
$$

For the lab below I use the concrete schedule

$$
\gamma_i = \frac{6}{\pi^2 i^2},
$$

whose infinite sum is one. This makes the total nominal mass no more than
$$q$$. It is conservative and simple. It also has a personality flaw: it
spends by calendar position, not by what the stream is learning. If good
signals arrive late, much of the easy budget has already passed by.

That is the first useful mental model. A static spending rule is a calendar,
not a discovery process.

## LOND Earns Room From Discoveries

Javanmard and Montanari proposed two online procedures, LOND and LORD, for
online control of FDR and marginal FDR.[^jm2015] LOND stands for "levels based
on number of discoveries." It keeps the same summable sequence idea but lets
past discoveries increase future levels.

Choose nonnegative $$\beta_i$$ such that

$$
\sum_{i=1}^{\infty}\beta_i=q.
$$

Then LOND tests hypothesis $$i$$ at

$$
\alpha_i = \beta_i \{D(i-1)+1\}.
$$

The factor $$D(i-1)+1$$ is the clocked denominator. Before any discovery,
LOND behaves like alpha-spending. After discoveries arrive, later tests get
larger levels. A stream that begins with plausible signals earns the right to
look harder later. A stream that begins with noise stays frugal.

This is not a magic p-value amplifier. The guarantee is attached to conditions
on the stream, especially validity of null p-values and assumptions about
independence or dependence. Later work by Javanmard and Montanari studied
generalized alpha-investing rules and online FDR under independence of true-null
p-values from the rest of the sequence, with additional conditions for
dependence.[^jm2016] The original LOND paper also gives a more conservative
adjustment for arbitrary dependence. The lab here uses independent synthetic
p-values, so it is demonstrating the mechanism, not stress-testing every
dependence case.

There is a historical trap in the terminology. Foster and Stine's
alpha-investing is also sequential and also earns testing wealth after
discoveries, but their original guarantee is for marginal FDR, the ratio of
expected false discoveries to expected discoveries, rather than FDR, the
expected ratio.[^foster-stine] Those are not interchangeable promises.

SAFFRON is a later and more powerful adaptive online-FDR algorithm. It also
uses an alpha-wealth view, learns from candidate p-values, and can dominate
earlier LORD-style rules in many settings.[^saffron] I am not implementing
SAFFRON below because this note is about the smallest moving part: the first
time you let the discovery count modify tomorrow's threshold, the budget has
become a clock.

## A Stream You Can Audit

The lab creates a sequence of synthetic one-sided p-values:

- null hypotheses produce independent uniform p-values;
- alternatives produce p-values of the form $$U^s$$, where larger $$s$$ makes
  small p-values more common;
- the signal order can be random, early, late, or bursty;
- the batch BH line is included only as an offline oracle that gets to sort the
  full stream after seeing it.

The four displayed procedures are:

1. raw thresholding at $$p_i < q$$;
2. alpha-spending with $$\beta_i=6q/(\pi^2 i^2)$$;
3. LOND with $$\alpha_i=\beta_i\{D(i-1)+1\}$$;
4. Benjamini-Hochberg on the completed stream as a non-online benchmark.[^bh]

The important comparison is not "which line is always best." The important
comparison is what each line was allowed to know when it made its decision.

<style>
  .online-fdr-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .online-fdr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .online-fdr-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .online-fdr-lab__controls input,
  .online-fdr-lab__controls select {
    accent-color: #0f766e;
    width: 100%;
  }

  .online-fdr-lab__controls select {
    background: #ffffff;
    border: 1px solid #ccd6df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    min-height: 2.15rem;
    padding: 0.25rem 0.45rem;
  }

  .online-fdr-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .online-fdr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .online-fdr-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.68rem;
  }

  .online-fdr-lab__metric span,
  .online-fdr-lab__legend,
  .online-fdr-lab__note {
    color: #5d6872;
    font-size: 0.78rem;
  }

  .online-fdr-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.04rem;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .online-fdr-lab canvas {
    display: block;
    height: 620px;
    max-width: 100%;
    width: 100%;
  }

  .online-fdr-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .online-fdr-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .online-fdr-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .online-fdr-lab__note {
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 560px) {
    .online-fdr-lab {
      padding: 0.85rem;
    }

    .online-fdr-lab canvas {
      height: 820px;
    }
  }
</style>

<div class="online-fdr-lab" data-online-fdr-lab>
  <div class="online-fdr-lab__controls">
    <label>
      Tests: <output data-value="tests">260</output>
      <input type="range" min="80" max="800" step="20" value="260" data-param="tests">
    </label>
    <label>
      Signal rate: <output data-value="signalRate">12%</output>
      <input type="range" min="0" max="35" step="1" value="12" data-param="signalRate">
    </label>
    <label>
      Signal strength: <output data-value="strength">5.5</output>
      <input type="range" min="15" max="90" step="5" value="55" data-param="strength">
    </label>
    <label>
      Target q: <output data-value="target">10%</output>
      <input type="range" min="1" max="20" step="1" value="10" data-param="target">
    </label>
    <label>
      Order: <output data-value="order">early signals</output>
      <select data-param="order">
        <option value="early" selected>Early signals</option>
        <option value="random">Random order</option>
        <option value="late">Late signals</option>
        <option value="bursty">Bursty signals</option>
      </select>
    </label>
  </div>
  <div class="online-fdr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Online false discovery rate simulator comparing raw thresholding, alpha spending, LOND, and batch Benjamini-Hochberg"></canvas>
  <div class="online-fdr-lab__legend">
    <span><i style="background:#be123c"></i> Raw p&lt;q</span>
    <span><i style="background:#7c3aed"></i> Alpha-spending</span>
    <span><i style="background:#0f766e"></i> LOND</span>
    <span><i style="background:#2563eb"></i> Batch BH oracle</span>
    <span><i style="background:#059669"></i> true signal p-values</span>
  </div>
  <p class="online-fdr-lab__note">
    Deterministic simulation. Each operating summary averages 160 streams at
    the default horizon; larger horizons use 120 streams to keep the page
    responsive. The oracle BH line is not an online rule.
  </p>
</div>

<script defer src="{{ '/assets/js/online-fdr-lab.js?v=20260618c' | relative_url }}"></script>

At the default setting, the stream has 260 tests, about 31 true signals, early
signal ordering, signal strength 5.5, and target $$q=10\%$$. Across 160
deterministic Monte Carlo streams:

- raw thresholding averages 43.4 discoveries with empirical FDR 52.7%;
- alpha-spending averages 6.4 discoveries with empirical FDR 0.3%;
- LOND averages 8.4 discoveries with empirical FDR 0.6%;
- the batch BH oracle averages 13.3 discoveries with empirical FDR 9.4%.

Those numbers are not a theorem. They are the audit trail for this synthetic
world. The theorem-level statement is narrower and stronger: under its
assumptions, LOND chooses each threshold online and controls online FDR. The
simulation shows the operating shape that theorem permits. Raw thresholding is
liberal because it forgets the denominator. Spending is cautious because it
does not earn from discoveries. LOND is still cautious, but it can convert early
discoveries into later testing room. Batch BH is powerful because it has a
privilege the online rules do not: it sees the full future before drawing a
line.

Change the order to "late signals" and the picture changes. LOND cannot spend
early discoveries that have not happened yet. The offline BH oracle is much
less bothered by the order because sorting erases time. That is exactly the
distinction online control is meant to preserve.

Before publishing, I ran the JavaScript lab through its Node API. The default
case passed finite-output checks, threshold-validity checks, the
alpha-spending-is-contained-in-LOND decision invariant, and the summable
$$6/(\pi^2 i^2)$$ schedule check. A 24-case sweep over horizon, signal rate,
signal order, and target $$q$$ passed 104/104 applicable checks: those four
structural invariants in every case, plus an all-null finite-grid FDR guard on
the eight no-signal rows. In the all-null cases, the largest empirical LOND FDR
in that sweep was 3.05%.

You can reproduce that sweep directly:

```js
const lab = require("./assets/js/online-fdr-lab.js");
const EXPECTED_HORIZONS = 2;
const EXPECTED_SIGNAL_RATES = 3;
const EXPECTED_ORDERS = 2;
const EXPECTED_TARGETS = 2;
const EXPECTED_NULL_CASES = 8;
const EXPECTED_CASES = 24;
const EXPECTED_CHECKS = 104;

const audit = lab.auditOnlineFdrLab();
const auditShape = {
  horizons: new Set(audit.cases.map((row) => row.tests)).size,
  signalRates: new Set(audit.cases.map((row) => row.signalRate)).size,
  orders: new Set(audit.cases.map((row) => row.order)).size,
  targets: new Set(audit.cases.map((row) => row.target)).size,
  nullCases: audit.cases.filter((row) => row.signalRate === 0).length,
  rows: audit.cases.length,
  passed: audit.passed,
  total: audit.total,
  passedChecks: audit.passedChecks,
  totalChecks: audit.totalChecks,
  maxNullLond: audit.maxNullLond
};
if (auditShape.horizons !== EXPECTED_HORIZONS ||
    auditShape.signalRates !== EXPECTED_SIGNAL_RATES ||
    auditShape.orders !== EXPECTED_ORDERS ||
    auditShape.targets !== EXPECTED_TARGETS ||
    auditShape.nullCases !== EXPECTED_NULL_CASES ||
    auditShape.rows !== EXPECTED_CASES ||
    auditShape.total !== EXPECTED_CASES ||
    auditShape.totalChecks !== EXPECTED_CHECKS) {
  throw new Error("unexpected audit size: " + JSON.stringify(auditShape));
}

const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (!audit.ok || failedCases.length || audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    failures: audit.failures,
    failedCases,
    auditShape
  }, null, 2));
}

console.log(`${audit.passed}/${audit.total} audit cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`);
console.log(`max all-null LOND FDR: ${(audit.maxNullLond * 100).toFixed(2)}%`);
console.table(audit.cases.map((row) => ({
  tests: row.tests,
  signals: row.signalRate + "%",
  order: row.order,
  q: row.target + "%",
  rawFdr: (row.rawFdr * 100).toFixed(1),
  spendFdr: (row.spendFdr * 100).toFixed(1),
  londFdr: (row.londFdr * 100).toFixed(1),
  bhFdr: (row.bhFdr * 100).toFixed(1),
  londDiscoveries: row.londDiscoveries.toFixed(1),
  bhDiscoveries: row.bhDiscoveries.toFixed(1)
})));
```

The all-null bound in that snippet is an audit tolerance for this finite
simulation grid, not the theoretical FDR guarantee. It is there to catch
implementation regressions that would make the displayed operating curves
misleading.

## What I Would Put In The Run Log

An online discovery system should keep more than a CSV of surviving p-values.
The run log should include:

1. the stream definition and when a new hypothesis is allowed to enter it;
2. the p-value construction and calibration checks under null cases;
3. the online rule that chooses $$\alpha_i$$ before seeing $$p_i$$;
4. the spending sequence or wealth update rule;
5. independence, positive-dependence, or arbitrary-dependence assumptions;
6. every non-discovery, because the denominator is part of the result;
7. every post-procedure human filter, because filtering changes the published
   list.

The last point is where many practical systems leak. If a platform controls
FDR for the automated discovery stream and then a team silently keeps only the
"interesting" survivors, the final list is not the list the procedure
controlled. Online FDR is a contract with the whole clock, not a stamp applied
to whichever rows are left in the slide deck.

## The Useful Sentence

The weak sentence is:

```text
we corrected for multiple testing
```

The useful online sentence is:

```text
for this predeclared stream,
with valid null p-values,
under this dependence story,
we chose each threshold from the past
and controlled the expected false fraction
among discoveries at each prefix
```

That sentence is longer because the claim is real. It names the clock.

[^bh]: Yoav Benjamini and Yosef Hochberg, "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing," *Journal of the Royal Statistical Society: Series B*, 1995. [DOI](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x). A public PDF is mirrored by Purdue's statistics course materials: [PDF](https://www.stat.purdue.edu/~doerge/BIOINFORM.D/FALL06/Benjamini%20and%20Y%20FDR.pdf).

[^jm2015]: Adel Javanmard and Andrea Montanari, "On Online Control of False Discovery Rate," arXiv, 2015. [arXiv:1502.06197](https://arxiv.org/abs/1502.06197).

[^jm2016]: Adel Javanmard and Andrea Montanari, "Online Rules for Control of False Discovery Rate and False Discovery Exceedance," arXiv, 2016. [arXiv:1603.09000](https://arxiv.org/abs/1603.09000).

[^foster-stine]: Dean P. Foster and Robert A. Stine, "Alpha-Investing: A Procedure for Sequential Control of Expected False Discoveries," *Journal of the Royal Statistical Society: Series B*, 2008. [DOI](https://doi.org/10.1111/j.1467-9868.2007.00643.x).

[^saffron]: Aaditya Ramdas, Tijana Zrnic, Martin J. Wainwright, and Michael I. Jordan, "SAFFRON: an Adaptive Algorithm for Online Control of the False Discovery Rate," *Proceedings of Machine Learning Research*, 2018. [PMLR](https://proceedings.mlr.press/v80/ramdas18a.html).
