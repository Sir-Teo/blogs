---
layout: post
title: "Variance Has an Algorithmic Shape"
description: "Variance looks like a formula, but in finite precision arithmetic the formula you choose can decide whether the answer is accurate, noisy, or impossible."
date: 2026-06-13 20:02:00 -0400
categories: computer-science
tags: [floating-point, numerical-stability, variance, welford, algorithms, software-engineering]
excerpt: "The expression E[x^2] - E[x]^2 is mathematically correct and computationally dangerous. A variance estimate is not just a statistic. It is an algorithm."
---

The variance has an innocent face:

$$
\operatorname{Var}(X) = E[X^2] - E[X]^2.
$$

That identity is true. It is also a trap.

In floating-point arithmetic, the right-hand side can ask the machine to
subtract two enormous nearly equal numbers and keep the tiny residue. The
residue is the variance. The leading digits are mostly the baseline.

If the data are around one billion and the standard deviation is around one,
then $$x^2$$ lives around $$10^{18}$$, while the variance lives around $$10^0$$.
The computation is trying to recover a one-unit answer after making two
one-quintillion-scale summaries agree to many digits.

That is not statistics anymore. That is numerical analysis.

## The Formula Is Not the Computation

The textbook one-pass formula for sample variance often appears as:

$$
s^2 =
\frac{\sum_i x_i^2 - (\sum_i x_i)^2/n}{n-1}.
$$

Mathematically, this is the same variance as

$$
\frac{1}{n-1}\sum_i (x_i-\bar{x})^2.
$$

Computationally, they are different machines.

David Goldberg's classic floating-point tutorial is still the right doorway
into this world: real numbers are rounded into a finite representation, and
rounding error is not a rare exception but the normal condition of floating
point computation.[^goldberg] Most arithmetic is approximate. Subtraction of
nearby quantities is where that approximation often becomes visible.

Variance is a perfect little demonstration because the desired answer is a
small difference between large summaries.

## A Small Failure Bench

The lab below generates a deterministic dataset with a controllable baseline,
spread, order, and precision model. It compares five algorithms:

- **textbook**, the one-pass $$\sum x_i^2 - (\sum x_i)^2/n$$ formula;
- **two pass**, compute the mean, then sum squared deviations;
- **shifted**, subtract the first value before applying the one-pass identity;
- **Welford**, update mean and corrected sum of squares online;
- **pairwise**, compute Welford states in blocks and merge them as a reduction
  tree.

The reference is a shifted, compensated two-pass computation on the stored
inputs. The lab also reports **input loss**, which compares the stored-input
variance with the intended synthetic variance. That distinction matters: once
the input values themselves have rounded away the small differences, no variance
algorithm can recover them.

<style>
  .variance-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .variance-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
  }

  .variance-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .variance-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .variance-lab__controls input,
  .variance-lab__controls select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .variance-lab__controls select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .variance-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .variance-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .variance-lab__metric span,
  .variance-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .variance-lab__metric span {
    display: block;
  }

  .variance-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .variance-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .variance-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="variance-stability-lab" class="variance-lab" data-variance-lab>
  <div class="variance-lab__controls">
    <label>
      Rows: <output data-value="n">3072</output>
      <input type="range" min="128" max="12000" step="128" value="3072" data-param="n">
    </label>
    <label>
      Baseline: <output data-value="offsetExp">1e9</output>
      <input type="range" min="0" max="15" step="1" value="9" data-param="offsetExp">
    </label>
    <label>
      Spread: <output data-value="spreadLog">1.000</output>
      <input type="range" min="-2" max="3" step="0.25" value="0" data-param="spreadLog">
    </label>
    <label>
      Trend: <output data-value="trend">25%</output>
      <input type="range" min="0" max="100" step="5" value="25" data-param="trend">
    </label>
    <label>
      Order
      <select data-param="order">
        <option value="mixed" selected>mixed</option>
        <option value="sorted">sorted</option>
        <option value="alternating">alternating</option>
      </select>
    </label>
    <label>
      Arithmetic
      <select data-param="mode">
        <option value="fp64" selected>binary64</option>
        <option value="fp32">simulated binary32</option>
      </select>
    </label>
  </div>
  <div class="variance-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Variance stability lab comparing textbook, two-pass, shifted, Welford, and pairwise variance algorithms"></canvas>
  <p class="variance-lab__note">
    Deterministic browser experiment. Binary64 uses JavaScript numbers. Binary32
    rounds inputs and arithmetic with Math.fround. The reference is a shifted,
    compensated two-pass computation on the stored inputs, so representation loss
    is reported separately from algorithm error.
  </p>
</div>
<script defer src="{{ '/assets/js/variance-stability-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the stored variance is about one. The textbook formula
can return a large negative number. That is not because variance became
negative. It is because the computation formed two summaries near $$10^{21}$$
and asked their difference to carry a value near $$10^3$$, the corrected sum of
squares.

The cancellation ratio in the lab is a crude warning light:

```text
how large are the quantities being subtracted relative to the corrected sum of squares?
```

When that ratio is enormous, the textbook formula is gambling that the leading
digits of both large summaries were accumulated with compatible errors. They
usually were not.

Now lower **Baseline** to $$10^2$$. The textbook formula recovers. The data did
not become more statistically friendly; the arithmetic did. The two large terms
are no longer so large relative to the variance.

Switch **Arithmetic** to simulated binary32 and push the baseline upward. A
different failure appears. The spacing between representable numbers can become
larger than the signal you hoped to measure. The lab's input-loss metric rises.
At that point Welford cannot save the original real-valued variation because it
never reached the stored data.

This gives two separate diagnoses:

- **algorithmic cancellation**, where the stored data contain the signal but the
  variance formula destroys it;
- **representation loss**, where the input precision has already rounded the
  signal away.

Those failures need different fixes.

## Welford's Small State

B. P. Welford's 1962 note gives an online way to update the corrected sum of
squares without storing the whole sample.[^welford] For a new observation
$$x_n$$, maintain $$n$$, the running mean, and $$M_2$$, the sum of squared
deviations from the current mean:

```text
delta  = x - mean
mean  += delta / n
delta2 = x - mean
M2    += delta * delta2
```

The sample variance is $$M_2/(n-1)$$.

The important move is that the algorithm works with deviations from a moving
center. It does not accumulate $$\sum x_i^2$$ and $$(\sum x_i)^2/n$$ as giant
neighbors and then hope their subtraction is kind.

Welford is not magic. It still uses floating-point arithmetic. It can still be
affected by input order and by precision loss in the stored observations. But it
is solving a better numerical problem.

## Two Passes Are Often Fine

There is a cultural bias toward one pass, especially in data systems. One pass
sounds efficient. Sometimes it is necessary: streaming telemetry, online
learning, distributed logs, memory-bound scans.

But if the data fit in memory and the variance does not need to be updated
online, a careful two-pass method is a strong default: first compute the mean,
then compute deviations from that mean. Chan, Golub, and LeVeque's analysis and
recommendations explicitly favor corrected two-pass computation in that regime,
with pairwise summation worth considering when $$n$$ is large and accuracy
matters.[^chan]

This is a useful software-engineering rule:

```text
one pass is a constraint, not a virtue
```

When the storage and latency budget allow a second pass, spending it can buy a
lot of numerical stability.

## Parallel Variance Has Its Own Shape

Welford's state also has a merge operation. If shard $$A$$ has $$n_a$$,
$$\bar{x}_a$$, and $$M_{2,a}$$, and shard $$B$$ has $$n_b$$, $$\bar{x}_b$$, and
$$M_{2,b}$$, then the combined corrected sum is:

$$
M_2 =
M_{2,a} + M_{2,b} +
(\bar{x}_b-\bar{x}_a)^2 \frac{n_a n_b}{n_a+n_b}.
$$

This is the Chan-Golub-LeVeque pairwise structure.[^chan] It is not merely a
convenience for distributed systems. It changes the error story. Tree-shaped
reductions tend to reduce the long chain of rounding errors compared with a
single left-to-right accumulation, and they map naturally to parallel machines.
Higham's summation work makes the broader point: even summing numbers has
algorithmic choices, and no single summation method is uniformly best in every
case.[^higham]

The lab's pairwise line is deliberately boring when things go well. Boring is
good. A variance reduction should not be dramatic.

## A Production Checklist

If a metric, feature store, backtest, or training pipeline computes variances, I
would want to know:

- Is any code using $$E[x^2] - E[x]^2$$ directly?
- Are inputs centered, shifted, or standardized before variance-like summaries?
- Is the computation one-pass because it must be, or because it was convenient?
- Are reductions deterministic across shards and thread counts?
- Is the algorithm stable for sorted, reverse-sorted, and adversarial orderings?
- Is the accumulator precision wider than the input precision?
- Is the system measuring representation loss separately from algorithm error?
- Are negative variances clamped silently, logged, or treated as bugs?
- Do tests include large baselines with small spreads?

The negative-variance question is the tell. Clamping a negative variance to zero
may keep a dashboard alive, but it can also hide the exact bug you needed to
learn from. Negative variance is not a statistical event. It is a numerical
smoke alarm.

## The Line I Would Keep

Variance is not just a formula. It is a reduction algorithm.

The same mathematical statistic can be computed by a fragile cancellation, a
stable online update, a shifted pass, or a parallel merge tree. The answer you
get is partly a property of the data and partly a property of the arithmetic
path you chose.

[^goldberg]: David Goldberg, ["What Every Computer Scientist Should Know About Floating-Point Arithmetic"](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html), *ACM Computing Surveys*, 23(1), 1991. DOI: [10.1145/103162.103163](https://dl.acm.org/doi/10.1145/103162.103163).

[^welford]: B. P. Welford, "Note on a Method for Calculating Corrected Sums of Squares and Products," *Technometrics*, 4(3), 1962. DOI: [10.1080/00401706.1962.10490022](https://doi.org/10.1080/00401706.1962.10490022). Bibliographic entry: [CiNii](https://cir.nii.ac.jp/crid/1361418520895878016?lang=en).

[^chan]: Tony F. Chan, Gene H. Golub, and Randall J. LeVeque, ["Algorithms for Computing the Sample Variance: Analysis and Recommendations"](https://www.math.pku.edu.cn/teachers/litj/notes/numer_anal/AmerStat_37_242_Chan_Variance.pdf), *The American Statistician*, 37(3), 1983.

[^higham]: Nicholas J. Higham, ["The Accuracy of Floating Point Summation"](https://nhigham.com/wp-content/uploads/2023/10/high93s.pdf), *SIAM Journal on Scientific Computing*, 14(4), 1993; see also [Accuracy and Stability of Numerical Algorithms](https://epubs.siam.org/doi/10.1137/1.9780898718027), SIAM, 2nd ed., 2002.
