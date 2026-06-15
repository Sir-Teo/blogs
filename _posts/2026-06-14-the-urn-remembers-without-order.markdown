---
layout: post
title: "Urns Remember Without Order"
description: "A Polya urn is reinforced and path-dependent, but still exchangeable. The order of the draws can disappear even when early luck never does."
date: 2026-06-14 19:01:00 -0400
categories: statistics
tags: [polya-urn, exchangeability, beta-binomial, reinforcement, bayesian-statistics, probability]
excerpt: "Polya's urn looks like a memory process: draw a color, put it back, add another of the same color. The surprise is that the final sequence remembers counts, not order."
---

Here is a tiny machine that makes large disagreements look natural.

Put two red balls and two blue balls in an urn. Draw one ball. Put it back. Then
add one more ball of the same color.

Draw red early, and future red becomes more likely. Draw blue early, and future
blue becomes more likely. The process rewards its own accidents.

So it sounds like a process with memory.

It is, but not the memory you might expect. A Polya urn remembers the count of
what happened. It does not remember the order.

That distinction is the whole trick.

## The Rule

Let the urn start with \(r\) red mass and \(b\) blue mass. After each draw, add
\(c\) units of mass to the color just drawn. If \(R_t\) red balls have been
drawn in the first \(t\) draws, then

$$
\Pr(X_{t+1}=\text{red}\mid X_1,\ldots,X_t)
=
\frac{r+cR_t}{r+b+ct}.
$$

The past matters. But it matters through one sufficient statistic: the number of
red draws so far.

Blackwell and MacQueen describe the finite-color urn in exactly this way: start
with initial color masses, draw from the urn, replace the drawn ball, and add
another ball of the same color.[^blackwell] They then extend the idea to a
continuum of colors and show a deeper fact: the empirical measure converges to a
random limiting distribution, and conditional on that random distribution, the
future observations are independent.[^blackwell]

For two colors, the same story is small enough to hold in one line. Set

$$
a=\frac{r}{c},\qquad d=\frac{b}{c}.
$$

For any length-\(n\) sequence with \(k\) red draws and \(n-k\) blue draws,

$$
\Pr(X_1=x_1,\ldots,X_n=x_n)
=
\frac{a^{[k]}d^{[n-k]}}{(a+d)^{[n]}},
$$

where \(u^{[m]}=u(u+1)\cdots(u+m-1)\) is a rising factorial.

No order term appears.

`RRRBBBB` and `RBRBRBB` have the same probability if they contain the same
number of red and blue draws. The urn is reinforced, but exchangeable.

## The Hidden Coin

Another way to run the same experiment is:

1. draw a hidden probability \(P\sim\mathrm{Beta}(a,d)\);
2. given \(P\), draw all observations independently as
   \(\mathrm{Bernoulli}(P)\).

That two-stage story produces the same finite sequence probabilities as the urn.
The reinforcement process is a way to sample from a mixture of iid worlds
without explicitly drawing the hidden probability first.

This is a de Finetti-shaped idea. Infinite exchangeable Bernoulli sequences are
mixtures of iid Bernoulli sequences; finite versions and approximations are more
delicate, which is why Diaconis and Freedman's finite exchangeability paper
became a standard reference.[^diaconis-freedman] Aldous's Saint-Flour notes are
the classic broad tour of exchangeability as a structure theorem rather than a
mere symmetry word.[^aldous]

The Polya urn is the classroom version where the mixing distribution is visible:

$$
P \sim \mathrm{Beta}\!\left(\frac{r}{c},\frac{b}{c}\right).
$$

This is why the sample proportion does not settle deterministically at
\(r/(r+b)\). It settles around a random limit. The process has a martingale
center, not a fixed destination.

## A Small Urn Lab

The lab below compares three views of the same question:

- one reinforced path;
- many reinforced paths;
- the endpoint distribution against an ordinary binomial with the same initial
  mean.

The default starts with two red and two blue balls, adds one copied ball after
each draw, and runs 80 draws across 1400 simulated paths. The ordinary binomial
variance would be `20.0`. The Polya endpoint variance is about `332.5`, close to
the beta-binomial value `336.0`.

Same mean. Completely different spread.

<style>
  .polya-lab {
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

  .polya-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  }

  .polya-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .polya-lab__controls input {
    accent-color: #7c3aed;
    min-width: 0;
    width: 100%;
  }

  .polya-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .polya-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .polya-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .polya-lab__metric span,
  .polya-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .polya-lab__metric span {
    display: block;
  }

  .polya-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .polya-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .polya-lab__note {
    margin: 0.9rem 0 0;
  }

  @media (min-width: 900px) {
    .polya-lab {
      margin-left: calc((100% - min(92vw, 1040px)) / 2);
      max-width: none;
      width: min(92vw, 1040px);
    }
  }
</style>

<div class="polya-lab" data-polya-urn-lab>
  <div class="polya-lab__controls">
    <label>
      Red start: <output data-value="red">2</output>
      <input type="range" min="1" max="20" step="1" value="2" data-param="red">
    </label>
    <label>
      Blue start: <output data-value="blue">2</output>
      <input type="range" min="1" max="20" step="1" value="2" data-param="blue">
    </label>
    <label>
      Copy weight: <output data-value="copy">1</output>
      <input type="range" min="1" max="8" step="1" value="1" data-param="copy">
    </label>
    <label>
      Draws: <output data-value="draws">80</output>
      <input type="range" min="20" max="220" step="5" value="80" data-param="draws">
    </label>
    <label>
      Paths: <output data-value="paths">1400</output>
      <input type="range" min="200" max="3200" step="100" value="1400" data-param="paths">
    </label>
    <label>
      Seed: <output data-value="seed">29</output>
      <input type="range" min="1" max="9999" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="polya-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Polya urn simulator showing one path, endpoint distribution, many futures, and an exchangeability order audit"></canvas>
  <p class="polya-lab__note" data-note>
    Equivalent beta prior: Beta(2, 2). Same-count histories have equal Polya
    probability.
  </p>
</div>

<script src="{{ '/assets/js/polya-urn-lab.js?v=20260614a' | relative_url }}"></script>

## What the Lab Is Testing

The "order audit" panel compares two sequences with the same counts:

```text
RRRRRRRBBBBBBB
RBRBRBRBRBRBRB
```

Under the Polya urn, the probability ratio is `1.000`. Under a sticky Markov
process with a similar first-step bias, the clustered sequence is enormously
more likely than the alternating one.

That contrast is the point. Reinforcement is not the same as recency bias.

In a sticky process, the last observation has special status. In the Polya urn,
the last observation is just one more ball in the total count. The process
learns a composition, not a trend.

This is also why the endpoint distribution is beta-binomial:

$$
\Pr(K=k)
=
\binom{n}{k}
\frac{B(k+a,n-k+d)}{B(a,d)}.
$$

The binomial says every path is sampling from the same fixed probability. The
beta-binomial says each path may be living in a different hidden world.

The variance inflation is:

$$
\frac{\operatorname{Var}_{\text{beta-binomial}}(K)}
{\operatorname{Var}_{\text{binomial}}(K)}
=
\frac{a+d+n}{a+d+1}.
$$

With \(a=d=2\) and \(n=80\), the multiplier is `16.8`. That is why the
histogram looks too wide for ordinary sampling noise. It is not too wide. It is
answering a different model.

## Where This Misleads People

Polya urns are often used as metaphors for contagion, rich-get-richer dynamics,
and cumulative advantage. Pemantle's survey places classical and generalized
Polya urns inside a much larger family of reinforced processes, including
reinforced random walks and applications in biology, economics, learning, and
agent-based models.[^pemantle]

The metaphor is useful, but it can seduce you into saying too much.

A Polya urn does not say "the last thing caused the next thing." It says "the
past changed the composition of the future." In the simplest urn, every
permutation with the same counts is equally plausible. That is a strong
symmetry assumption.

For products, markets, social feeds, and games, that symmetry is often false.
Order may matter because of recency, network exposure, seasonality, inventory,
fatigue, matchmaking, liquidity, or changing incentives. In those cases the urn
is not a realistic simulator. It is a baseline that separates two ideas:

```text
overdispersion from hidden heterogeneity
order-dependence from local temporal mechanics
```

Those are easy to confuse in dashboards. If one cohort ends at 80% red and
another ends at 20% red, a binomial model calls one of them strange. A Polya urn
may call both ordinary. If the sequence alternates or clusters in suspicious
ways, the urn may be the wrong model even when the counts look right.

## The Practical Lesson

The urn's lesson is not "everything is path-dependent." That is too vague to
help.

The sharper lesson is:

```text
reinforcement can create persistent disagreement without requiring order memory
```

Early draws change the future because they change the composition. But once you
condition on the final count, the simple urn has forgotten the order completely.

That is why it is such a good little object. It keeps two intuitions apart that
normally arrive fused together:

- a process can be non-iid without being temporally sticky;
- a sample proportion can be centered correctly and still have the wrong
  variance;
- a hidden random environment can look like self-reinforcing behavior from the
  outside.

When a metric keeps polarizing across users, models, strategies, or markets, I
now ask two questions before I reach for a story:

```text
Did the process remember the order?
Or did it only reveal a hidden composition?
```

The Polya urn is what happens when the second answer is enough.

[^blackwell]: David Blackwell and James B. MacQueen, "Ferguson Distributions Via Polya Urn Schemes", *The Annals of Statistics* 1(2), 353-355, 1973. [Project Euclid](https://projecteuclid.org/journals/annals-of-statistics/volume-1/issue-2/Ferguson-Distributions-Via-Polya-Urn-Schemes/10.1214/aos/1176342372.full), [PDF copy](https://users.wpi.edu/~balnan/Blackwell1973.pdf).

[^diaconis-freedman]: Persi Diaconis and David Freedman, "Finite Exchangeable Sequences", *The Annals of Probability* 8(4), 745-764, 1980. [Semantic Scholar record](https://www.semanticscholar.org/paper/Finite-Exchangeable-Sequences-Diaconis-Freedman/094107897bd2c9e29d8172f983b05ae6ed291ae8), [DOI](https://doi.org/10.1214/AOP/1176994663).

[^aldous]: David J. Aldous, "Exchangeability and Related Topics", Ecole d'Ete de Probabilites de Saint-Flour XIII, 1983. [PDF](https://www.stat.berkeley.edu/~aldous/Papers/me22.pdf).

[^pemantle]: Robin Pemantle, "A survey of random processes with reinforcement", *Probability Surveys* 4, 1-79, 2007. [Project Euclid](https://projecteuclid.org/journals/probability-surveys/volume-4/issue-none/A-survey-of-random-processes-with-reinforcement/10.1214/07-PS094.pdf), [arXiv](https://arxiv.org/abs/math/0610076).
