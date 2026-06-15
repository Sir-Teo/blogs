---
layout: post
title: "The Loaded Die Has a Table"
description: "The alias method turns a fixed categorical distribution into equal-width boxes, so a draw needs one random column and one threshold comparison."
date: 2026-06-15 14:52:00 -0400
categories: computer-science
tags: [alias-method, sampling, monte-carlo, random-variate-generation, categorical-distribution, algorithms]
excerpt: "If you will roll the same loaded die many times, stop walking the CDF. Build a table whose columns all have the same width and at most two outcomes."
---

There are two very different jobs hiding inside "sample from this distribution."

The first job happens once:

```text
look at the probabilities
build a small machine
```

The second job happens every time:

```text
turn fresh uniform randomness
into one outcome
```

If the distribution changes after every draw, a cumulative distribution function
is hard to beat for simplicity. Add the probabilities, draw `u`, and walk until
the running sum crosses `u`.

But if the same loaded die will be rolled thousands or millions of times, the
walk starts to feel wasteful. The alias method pays a setup cost to make the
second job almost insultingly small:

```text
choose a column uniformly
flip one biased coin inside that column
```

That is the table.

## Equal-Width Boxes

Suppose the die has $$n$$ faces and probabilities $$p_1,\ldots,p_n$$. Stretch
the probability bars by $$n$$, so a face with probability above $$1/n$$ is too
tall and a face below $$1/n$$ is too short.

The alias construction repeatedly pairs one short bar with one tall bar:

```text
short column keeps its own remaining mass
the tall face pours enough mass into the leftover space
the tall face becomes a little less tall
```

After the pairing, every column has total mass exactly $$1/n$$. Each column
contains at most two labels: its own label and an alias label borrowed from some
larger bar.

Sampling is then:

$$
J \sim \operatorname{Uniform}\{1,\ldots,n\},
$$

and, independently,

$$
U \sim \operatorname{Uniform}(0,1).
$$

If $$U < q_J$$, return the column's local outcome. Otherwise return its alias.
The returned mass of outcome $$i$$ is just the sum of all pieces labelled $$i$$
across the equal-width columns.

Walker introduced the alias method for fast discrete random generation in the
1970s.[^walker] Vose later gave the now-standard linear-time table construction:
maintain stacks of small and large scaled probabilities, then move mass from the
large stack into short columns until both stacks disappear.[^vose] L'Ecuyer's
survey gives the practical summary: sequential and binary CDF search take
$$O(k)$$ and $$O(\log k)$$ worst-case time over $$k$$ outcomes, while the alias
method takes $$O(1)$$ time per variate after $$O(k)$$ setup and storage.[^lecuyer]

That last phrase is the bargain. The table is not free. It is a prepaid sampler.

## Why This Is Not the CDF

The alias method is sometimes taught as a clever way to do inversion. It is not.

A CDF sampler is monotone: nearby uniform values usually name nearby outcomes.
The alias table deliberately breaks that geometry. One column near the right
edge of the table may return a heavy head item if that head item donated mass
there. L'Ecuyer points out this non-inversion property explicitly.[^lecuyer]

That matters in two ways.

First, it is harmless when all you need is an independent categorical draw. A
language-model token sampler, a Monte Carlo event type, a loot-table outcome, or
a resampling step in a particle method often lives in that world.

Second, it is not harmless when the position of `u` carries structure. If you
need common random numbers, antithetic coupling, stratified monotone samples, or
quantile semantics, the CDF's geometry is part of the computation. The alias
table gives you the right marginal law, not a sorted quantile map.

## A Table You Can Audit

The lab below builds a Vose-style alias table for a synthetic categorical law.
It then reconstructs the distribution from the table pieces and separately runs
deterministic draws through three samplers:

1. the alias table;
2. a linear CDF walk;
3. a binary-search CDF walk.

The important test is not the Monte Carlo bar chart. Monte Carlo always wiggles.
The important test is the exact reconstruction:

$$
\widehat p_i
= \sum_{j=1}^n
\frac{1}{n}
\left[
\mathbf{1}\{i=j\}q_j
+ \mathbf{1}\{i=a_j\}(1-q_j)
\right].
$$

If the alias probabilities $$q_j$$ and alias labels $$a_j$$ are correct, this
equals the original $$p_i$$ to floating-point precision.

<style>
  .alias-table-lab {
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

  .alias-table-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .alias-table-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .alias-table-lab__controls input,
  .alias-table-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .alias-table-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .alias-table-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .alias-table-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .alias-table-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .alias-table-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .alias-table-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(1rem, 2.8vw, 1.35rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.16rem;
    overflow-wrap: anywhere;
  }

  .alias-table-lab canvas {
    display: block;
    max-width: 100%;
    width: 100%;
  }

  .alias-table-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.9rem 0 0;
  }
</style>

<div class="alias-table-lab" data-alias-table-lab>
  <div class="alias-table-lab__controls">
    <label>
      Profile
      <select data-param="profile">
        <option value="token" selected>token tail</option>
        <option value="loot">loot table</option>
        <option value="flat">nearly flat</option>
      </select>
    </label>
    <label>
      Outcomes <output data-output="items">18</output>
      <input type="range" min="4" max="32" step="1" value="18" data-param="items">
    </label>
    <label>
      Skew <output data-output="skew">1.35</output>
      <input type="range" min="0" max="240" step="5" value="135" data-param="skew">
    </label>
    <label>
      Draws <output data-output="draws">14000</output>
      <input type="range" min="1000" max="40000" step="500" value="14000" data-param="draws">
    </label>
    <label>
      Seed <output data-output="seed">37</output>
      <input type="range" min="1" max="999" step="1" value="37" data-param="seed">
    </label>
  </div>
  <div class="alias-table-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Alias method lab showing equal-width alias columns, Monte Carlo draw error, CDF staircase, and comparison-count model"></canvas>
  <p class="alias-table-lab__note">
    The audit is generated by the same JavaScript as the lab. It checks parameter
    sanitation, exact alias-table reconstruction, simple edge distributions,
    deterministic Monte Carlo behavior, column uniformity, comparison counts,
    setup break-even, and a 96-case grid over profiles, outcome counts, skews,
    and seeds.
  </p>
</div>

<script defer src="{{ '/assets/js/alias-table-lab.js?v=20260615a' | relative_url }}"></script>

At the default setting, the head outcome has probability `29.0%`, but the
entropy-equivalent support is about `9.1` outcomes. The alias construction uses
`17` aliased columns out of `18`. The exact table reconstruction misses the
target by only `2.22e-16`, which is just floating-point roundoff.

The empirical alias draws have total-variation error about `0.90%` after
`14,000` deterministic draws. The expected linear CDF walk takes about `3.93`
threshold checks per draw because the distribution is head-heavy; binary search
takes about `5.50` checks in this small example; the alias draw uses one
threshold check after the random column is chosen. Under the lab's intentionally
plain comparison-count model, the setup debt breaks even after about `12` draws
against the linear walk.

That number is not a universal benchmark. It is a model for seeing the trade.
Real code also pays for random-number generation, cache behavior, branch
prediction, table width, vectorization, and distribution updates.

## The Annoying Engineering Details

Alias tables are easy to get right in real arithmetic and slightly easier to get
wrong in software.

Apache Commons RNG's implementation notes are a good reminder that production
samplers care about dyadic probability resolution, integer comparisons, zero
padding, and storage layout.[^apache] A floating-point textbook implementation
is fine for a notebook. A library implementation has to decide what happens when
a probability is tiny but nonzero, when the input sum is huge, when padding to a
power of two improves index generation, and when avoiding a floating-point
comparison is worth an integer table.

There is also an optimization trap. Smith and Jacobson analyzed alias-table
designs and showed that optimizing the table to reduce expected per-draw work
can itself be hard; different valid alias tables can have different operational
costs.[^smith] The simple Vose construction is popular because it is linear and
reliable, not because it solves every possible table-layout objective.

Marsaglia, Tsang, and Wang later described even faster specialized methods for
important discrete distributions such as Poisson, binomial, and hypergeometric
random variables.[^marsaglia] That is the other side of the lesson: if the
distribution has exploitable structure, use it. The alias method is for the
large middle ground where the law is arbitrary but reused.

## When I Would Reach for It

Use an alias table when:

- the categorical distribution is reused many times;
- the outcome count is large enough that walking a CDF matters;
- the distribution is arbitrary enough that specialized samplers do not apply;
- you only need the marginal categorical law, not a monotone quantile map.

Avoid it, or at least hesitate, when:

- the probabilities change almost every draw;
- there are only a handful of outcomes;
- reproducible quantile coupling matters;
- memory bandwidth is already the bottleneck.

The method is not magic. It is just a beautiful little conversion:

```text
probability mass with uneven heights
becomes equal-width boxes
with one local label
and one borrowed label
```

The loaded die has not become fair. The columns have.

[^walker]: A. J. Walker, "New fast method for generating discrete random numbers with arbitrary frequency distributions," *Electronics Letters* 10(8), 1974; and "An Efficient Method for Generating Discrete Random Variables with General Distributions," *ACM Transactions on Mathematical Software* 3(3), 1977. ACM record: <https://dl.acm.org/doi/10.1145/355744.355749>.

[^vose]: Michael D. Vose, "A Linear Algorithm for Generating Random Numbers with a Given Distribution," *IEEE Transactions on Software Engineering* 17(9), 1991. DOI record: <https://dl.acm.org/doi/10.1109/32.92917>.

[^lecuyer]: Pierre L'Ecuyer, ["Random Number Generation"](https://web.tecnico.ulisboa.pt/~ist11038/compute/or/%2Crand/2004LEcuyer.pdf), in *Handbooks in Operations Research and Management Science*, 2006. Section 8.2 summarizes the alias method's $$O(1)$$ draw time after $$O(k)$$ setup and notes that it is not inversion.

[^apache]: Apache Commons RNG, [`AliasMethodDiscreteSampler`](https://commons.apache.org/proper/commons-rng/commons-rng-sampling/apidocs/org/apache/commons/rng/sampling/distribution/AliasMethodDiscreteSampler.html), implementation notes and API documentation.

[^smith]: J. Cole Smith and Sheldon H. Jacobson, ["An Analysis of the Alias Method for Discrete Random-Variate Generation"](https://www2.stat.duke.edu/courses/Spring06/sta293.2/alias.pdf), *INFORMS Journal on Computing* 17(3), 2005.

[^marsaglia]: George Marsaglia, Wai Wan Tsang, and Jingbo Wang, ["Fast Generation of Discrete Random Variables"](https://www.jstatsoft.org/article/view/v011i03), *Journal of Statistical Software* 11(3), 2004.
