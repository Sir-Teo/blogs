---
layout: post
title: "The Sum Has a Schedule"
description: "Floating-point addition is commutative but not associative. Once a sum is parallelized, shuffled, vectorized, or compensated, the reduction order becomes part of the numerical algorithm."
date: 2026-06-16 19:46:00 -0400
categories: software-engineering
tags: [floating-point, summation, numerical-stability, reproducibility, parallel-reductions, compensated-summation]
excerpt: "A sum is not only a bag of numbers. In finite precision, it is also a schedule, and that schedule decides which small terms survive."
---

The most suspicious bug report in numerical software is the one that says:

```text
same input, same code, different total
```

The code is usually innocent in the narrow sense. It read the same bytes. It
used the same formula. It added the same values.

What changed was the schedule.

A vector got split across a different number of worker threads. A database
aggregate chose a different hash-table iteration order. A GPU reduction used a
different tree. A compiler vectorized a loop. A linear algebra library changed
its tiling. The mathematical sum did not change, but the parenthesized
expression did.

For real numbers, that distinction is cosmetic:

```text
((a + b) + c) == (a + (b + c))
```

For floating-point numbers, it is a contract negotiation.

```text
(2^53 + 1) - 2^53 == 0
2^53 + (1 - 2^53) == 1
```

In JavaScript's binary64 arithmetic, `2^53` is exactly representable, `1` is
exactly representable, and `-2^53` is exactly representable. The problem is not
that the inputs are strange decimals. The problem is that the spacing between
representable numbers around `2^53` is two. The lonely `1` has nowhere to land
when it is added to the huge partial sum.

That is the whole essay in miniature:

```text
summation = values + accumulator + schedule
```

## The Standard Gives You Rounds, Not Associativity

IEEE 754 gives modern software an extraordinary gift: arithmetic operations
have specified formats, rounding rules, exceptional values, and a shared
language for binary and decimal floating point.[^ieee] Goldberg's classic
tutorial remains the best doorway into the practical consequences: floating
point is finite, most real results must be rounded, and those rounding decisions
matter to systems builders.[^goldberg]

But the standard does not turn rounded addition into real addition.

For ordinary finite values, `a + b` and `b + a` usually round to the same thing.
So addition is effectively commutative. Associativity is the one that breaks:

```text
(a + b) + c
a + (b + c)
```

Those are two different floating-point programs. Each `+` rounds before the next
one starts. If the first program rounds away a small term, the second program
does not get to ask for it back.

That is why a reduction tree is not just a performance detail. It is a
numerical method.

## A Small Failure Notebook

The lab below makes the schedule visible. It generates integer-valued inputs
that are exactly representable as binary64 numbers, then compares several ways
to add them:

- **left fold**, the usual `sum += x`;
- **pairwise**, a balanced binary tree over the selected schedule;
- **Kahan**, a compensated sum with one correction variable;
- **Neumaier**, a compensated variant that handles large incoming terms more
  carefully;
- **sort by magnitude**, a small-first ordering;
- **parallel shards**, contiguous chunks summed separately and then reduced.

The reference is an exact `BigInt` ledger of the generated integer inputs. That
is not a general exact-sum implementation for arbitrary floats. It is a
controlled test bench where the mathematical answer is known.

<style>
  .sum-lab {
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

  .sum-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .sum-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sum-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .sum-lab input,
  .sum-lab select {
    accent-color: #2563eb;
    width: 100%;
  }

  .sum-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .sum-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sum-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .sum-lab__metric span,
  .sum-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sum-lab__metric span {
    display: block;
  }

  .sum-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .sum-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sum-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="floating-sum-lab" class="sum-lab" data-floating-sum-lab>
  <div class="sum-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="bookend" selected>bookended units</option>
        <option value="triples">hostile triples</option>
        <option value="ledger">mixed ledger</option>
      </select>
    </label>
    <label>
      Schedule
      <select data-param="schedule">
        <option value="input" selected>input order</option>
        <option value="reverse">reverse</option>
        <option value="absAsc">small magnitude first</option>
        <option value="absDesc">large magnitude first</option>
        <option value="shuffle">deterministic shuffle</option>
      </select>
    </label>
    <label>
      Units or groups: <output data-value="units">64</output>
      <input type="range" min="4" max="512" step="4" value="64" data-param="units">
    </label>
    <label>
      Parallel shards: <output data-value="shards">4</output>
      <input type="range" min="1" max="16" step="1" value="4" data-param="shards">
    </label>
    <label>
      Shuffle seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="97" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="sum-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Floating-point summation lab showing error by algorithm, shuffle schedule spread, and prefix error"></canvas>
  <p class="sum-lab__note">
    Deterministic browser experiment. Inputs are integers chosen to be exactly
    representable as JavaScript binary64 numbers. The exact reference is a
    BigInt ledger of those generated inputs, so the experiment isolates
    summation error from decimal parsing or measurement noise.
  </p>
</div>
<script defer src="{{ '/assets/js/floating-sum-lab.js?v=20260616a' | relative_url }}"></script>

The first scenario is the cleanest:

```text
[2^53, 1, 1, ..., 1, -2^53]
```

The exact sum is the number of ones. The left fold returns zero at the default
setting because every one is added while the accumulator is sitting at `2^53`.
The balanced tree, Kahan, Neumaier, and the small-first schedule all recover the
answer.

That is the friendly failure.

Now switch to **hostile triples**. The input repeats:

```text
[2^53, 1, -2^53]
```

At 32 groups, the exact sum is `32`. The lab audit sees:

```text
left fold      0
pairwise      32
Kahan         42
Neumaier      32
small-first   32
4 shards      0
```

That line is the antidote to a lot of cargo-cult numerics. Kahan summation is a
real and useful algorithm, going back to Kahan's 1965 note on reducing
truncation errors.[^kahan] But one compensation variable is still a finite
state machine being driven by a particular schedule. It is not exact arithmetic.

The mixed ledger scenario is less theatrical and more like production. It mixes
positive and negative powers of two with small integer debits and credits. The
exact answer is modest, but 40 deterministic shuffles can produce several
answers. Nothing random is happening inside addition. The order changed, so the
rounding history changed.

## Why Pairwise Often Looks Boring

Pairwise summation is the plainest useful fix: add nearby subranges first, then
add their results. It shortens the long dependency chain of a left fold and
tends to reduce error growth. It also maps naturally onto parallel machines.

But pairwise summation does not make floating-point addition associative. It
chooses a tree.

That tree may be better than a left fold. It may also be different from the tree
chosen by a thread pool, a GPU warp, a database engine, or a BLAS library. If a
system promises only "some parallel reduction," then the numerical result is
under-specified.

Higham's 1993 paper is still the sober reference here. It analyzes several
summation methods and compares them with both rounding-error analysis and
experiments. The useful conclusion is not "one method wins." The useful
conclusion is that summation has methods.[^higham]

That sounds too simple until a model metric changes in the third decimal place
because an upstream job changed its partition count.

## Compensation Is An Error Ledger

Kahan's idea is to keep a tiny side account. If adding `x` to `sum` loses a
low-order piece, store an estimate of that lost piece in `c` and subtract it
from the next input:

```text
y = x - c
t = sum + y
c = (t - sum) - y
sum = t
```

That is not the only compensated scheme. Neumaier's variant updates the
compensation depending on which of `sum` and `x` has larger magnitude. Ogita,
Rump, and Oishi later developed accurate summation and dot-product algorithms
using error-free transformations, with results comparable to higher working
precision while staying in the same nominal precision.[^ogita]

The family resemblance is important:

```text
do not pretend the low-order error vanished
carry some representation of it forward
```

Compensation buys accuracy. It may also complicate vectorization, parallelism,
and reproducibility because the compensation state itself has an order. If you
split a compensated sum into shards, each shard has its own correction history,
and then those histories must be merged somehow.

There is no free lunch here. There are better receipts.

## Reproducibility Is A Stronger Promise Than Accuracy

Accuracy asks:

```text
is this answer close to the real sum?
```

Reproducibility asks:

```text
will I get the same bits if the legal schedule changes?
```

Those are different promises.

You can have an accurate method that is not reproducible across thread counts.
You can have a reproducible method that is not the most accurate available.
Production systems often need both, but they should not be confused.

Demmel and Nguyen's work on reproducible floating-point summation attacks this
directly. Their ARITH 2013 presentation starts from the fact that floating-point
operations are commutative but not associative, then defines reproducibility as
bitwise-identical results across runs on the same input even when resources or
reduction order differ.[^demmel-nguyen] The later ReproBLAS project describes
BLAS routines that guarantee reproducibility independent of processor count,
data partitioning, and reduction order under explicit IEEE-style assumptions.[^reproblas]

The conceptual move is to stop treating the accumulator as a single floating
point number. Use a binned accumulator, a superaccumulator, an error-free
transformation pipeline, or another representation that makes the merge itself
well-defined. Then the final rounded answer is extracted from that richer
state.

This is why reproducible summation is a systems problem, not just a numerical
analysis footnote. The answer depends on:

- the format;
- the rounding mode;
- the accumulator state;
- the partitioning;
- the merge tree;
- the final extraction rule.

If those are not specified, "sum" is not fully specified.

## Places This Actually Bites

The obvious victims are scientific simulations and linear algebra. They are not
the only ones.

A finance backtest summing P&L across fills can change when fills are grouped by
venue, symbol, or worker shard. A database `GROUP BY` over floating-point
measurements can change when the query plan changes. A training loop can report
slightly different loss curves when gradient buckets are reduced in a different
order. A game physics engine can drift when entity iteration order changes. A
metrics pipeline can emit a different total after an autoscaler changes the
number of reducers.

Most of those differences are small. Small is not the same as harmless.

Small nondeterminism is enough to make tests flaky, bisects confusing, cached
artifacts invalid, and model comparisons suspicious. It is also enough to hide a
large conditioning problem until an unlucky schedule exposes it.

When I see a production sum over floats, I want to know which promise it makes:

- **fast approximate**, where small schedule differences are accepted;
- **stable approximate**, where pairwise or compensated methods are used;
- **deterministic schedule**, where the same tree is forced every time;
- **order-independent reproducible**, where a richer accumulator is used;
- **exact then rounded**, where the implementation pays for a full exact
  accumulator or equivalent method.

Those are different products. A codebase should not sell one while implementing
another.

## A Test I Would Add

Every shared summation primitive should have adversarial schedule tests.

Not only random data. Random data is too polite.

I would include:

```text
[2^53, many 1s, -2^53]
repeat([2^53, 1, -2^53])
mixed signed powers of two plus small residues
sorted ascending by magnitude
sorted descending by magnitude
several deterministic shuffles
several shard counts
```

The test does not have to demand the same answer from every implementation. It
has to make the chosen promise explicit. If the primitive is a fast approximate
sum, record the observed envelope. If it is advertised as reproducible, change
the schedule until you believe it.

The worst possible state is not "we chose speed." Speed is a legitimate choice.

The worst state is:

```text
we thought addition was just addition
```

It is not. A sum has a schedule.

## Paper Trail

[^ieee]: IEEE, ["754-2019 - IEEE Standard for Floating-Point Arithmetic"](https://doi.org/10.1109/IEEESTD.2019.8766229), IEEE Std 754-2019, July 2019. DOI metadata: [BibBase](https://bibbase.org/network/publication/ieee-7542019ieeestandardforfloatingpointarithmetic-2019).

[^goldberg]: David Goldberg, ["What Every Computer Scientist Should Know About Floating-Point Arithmetic"](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html), *ACM Computing Surveys*, 23(1), 1991. DOI: [10.1145/103162.103163](https://dl.acm.org/doi/10.1145/103162.103163).

[^kahan]: William Kahan, ["Pracniques: Further Remarks on Reducing Truncation Errors"](https://dl.acm.org/doi/10.1145/363707.363723), *Communications of the ACM*, 8(1), 1965.

[^higham]: Nicholas J. Higham, ["The Accuracy of Floating Point Summation"](https://epubs.siam.org/doi/10.1137/0914050), *SIAM Journal on Scientific Computing*, 14(4), 1993, pp. 783-799. Author PDF: [high93s.pdf](https://nhigham.com/wp-content/uploads/2023/10/high93s.pdf).

[^ogita]: Takeshi Ogita, Siegfried M. Rump, and Shin'ichi Oishi, ["Accurate Sum and Dot Product"](https://epubs.siam.org/doi/10.1137/030601818), *SIAM Journal on Scientific Computing*, 26(6), 2005, pp. 1955-1988. Author PDF: [OgRuOi05.pdf](https://www.tuhh.de/ti3/paper/rump/OgRuOi05.pdf).

[^demmel-nguyen]: James Demmel and Hong Diep Nguyen, ["Fast Reproducible Floating-Point Summation"](https://dl.acm.org/doi/10.1109/ARITH.2013.9), ARITH 2013, pp. 163-172. Slides: [Fast_Sum.pdf](https://bebop.cs.berkeley.edu/reproblas/docs/talks/ARITH21_Fast_Sum.pdf).

[^reproblas]: ReproBLAS project page, ["Reproducible Basic Linear Algebra Sub-programs"](https://bebop.cs.berkeley.edu/reproblas/). See also Peter Ahrens, James Demmel, and Hong Diep Nguyen, ["Algorithms for Efficient Reproducible Floating Point Summation"](https://dl.acm.org/doi/10.1145/3389360), *ACM Transactions on Mathematical Software*, 46(3), 2020.
