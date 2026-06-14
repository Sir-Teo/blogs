---
layout: post
title: "Give Every Candidate a Clock"
description: "The Gumbel-max trick turns a categorical draw into a race: add one random key to every log weight, take the winner, or sort the same keys for sampling without replacement."
date: 2026-06-14 11:48:00 -0400
categories: machine-learning
tags: [gumbel-max, sampling, plackett-luce, stochastic-beam-search, categorical-distribution, machine-learning, probability]
excerpt: "A categorical sample can be read as a race between exponential clocks. Keep sorting those clocks and top-k becomes exact weighted sampling without replacement."
---

I used to think of categorical sampling as bookkeeping.

Normalize weights. Draw a uniform random number. Walk along the cumulative sum
until the mass crosses it.

That implementation is fine. It is also the dullest mental model. There is
another one:

```text
give every candidate a private clock;
the first clock to ring is the sample
```

The clock view is not a metaphor. If item $$i$$ has positive weight $$w_i$$ and
its clock time is

$$
T_i = E_i / w_i, \quad E_i \sim \operatorname{Exp}(1),
$$

then

$$
P(T_i = \min_j T_j) = \frac{w_i}{\sum_j w_j}.
$$

A heavier item simply has a faster clock. The first arrival is a categorical
draw.

Now take logs:

$$
-\log T_i = \log w_i - \log E_i.
$$

Because $$-\log E_i$$ has a standard Gumbel distribution, the same race can be
written as

$$
\arg\max_i \{ \log w_i + G_i \}, \quad G_i \sim \operatorname{Gumbel}(0,1).
$$

That is the Gumbel-max trick. It converts sampling into optimization. Draw one
independent noise value per item, add it to the log weight, and take an argmax.
The maximum is random, but the operation is deterministic after the perturbation.

This tiny identity is one of those ideas that keeps reappearing under different
names: random utility models, Luce choice, perturb-and-MAP, weighted reservoir
sampling, stochastic beam search. The interesting part is not that it saves a
few lines of sampling code. The interesting part is that it lets "sample" and
"search" share the same object: a noisy score table.

## Softmax as a Race

Suppose a language model gives unnormalized logits $$\phi_i$$ for the next token.
After temperature, the categorical law is

$$
p_i = \frac{\exp(\phi_i)}{\sum_j \exp(\phi_j)}.
$$

Gumbel-max says we may sample from this distribution by drawing independent
Gumbel noises and returning

$$
\arg\max_i \{\phi_i + G_i\}.
$$

This is more than a trick for avoiding numerical underflow. It says that a
softmax can be represented as a competition among noisy utilities. That
connection goes back to choice theory. Luce's choice axiom gives the ratio form
of choice probabilities.[^luce] Yellott showed the relationship between Luce's
axiom, Thurstone-style random utility, and the double-exponential distribution,
which is another name tied to the Gumbel law.[^yellott]

The exponential clock proof is short enough to keep in your head. Independent
exponential clocks have two useful properties:

1. The minimum of exponentials is exponential with rate equal to the sum of the
   rates.
2. The chance that clock $$i$$ is the first one equals its rate divided by the
   sum of rates.

With rates $$w_i$$, this is exactly categorical sampling. With
$$w_i=\exp(\phi_i)$$, it is exactly softmax sampling.

The Gumbel form is just the log-space version of the same race. Let
$$E_i \sim \operatorname{Exp}(1)$$. Then

$$
P(-\log E_i \le x)
=
P(E_i \ge e^{-x})
=
\exp(-e^{-x}),
$$

which is the standard Gumbel CDF. So sorting
$$\phi_i - \log E_i$$ descending is the same as sorting $$E_i / \exp(\phi_i)$$
ascending.

One uniform random number per item is enough to build both views:

```text
E_i = -log(U_i)
G_i = -log(-log(U_i))
clock_i = E_i / exp(phi_i)
key_i = phi_i + G_i
```

The key with the largest value and the clock with the smallest value name the
same item.

## Do Not Stop at the First Bell

The next move is the part that makes the identity feel larger than a categorical
sampler.

Do not stop at the maximum.

Sort all the noisy keys:

$$
\phi_i + G_i.
$$

The first item is a categorical sample. The second item is what you would have
sampled from the remaining items after removing the first. The first $$k$$ items
are an exact weighted sample without replacement. Their ordered probability is

$$
P(i_1,\ldots,i_k)
=
\prod_{t=1}^{k}
\frac{\exp(\phi_{i_t})}{
\sum_{j \notin \{i_1,\ldots,i_{t-1}\}} \exp(\phi_j)
}.
$$

That is the Plackett-Luce ranking law. In machine learning papers this sorted
perturbation view is often called Gumbel-top-k. Kool, van Hoof, and Welling used
it to construct stochastic beam search: a way to sample unique sequences without
replacement while still using beam-search-like structure.[^kool] The broader
Gumbel process view in Maddison, Tarlow, and Minka's A* sampling paper makes the
same philosophical move for continuous spaces: sampling can be phrased as
optimizing a random perturbation.[^astar]

This is not the same thing as drawing $$k$$ independent samples from the
categorical distribution. Independent draws collide. If the head item has
probability 0.47 and we draw four times with replacement, a lot of the budget is
spent rediscovering the same item.

The lab below makes that failure visible. It creates a small next-token-like
categorical law, adds Gumbel noise, and checks the empirical first-pick and
top-k inclusion frequencies against the exact formulas.

<style>
  .gumbel-lab {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    margin: 1.5rem 0;
    padding: 1rem;
    background: #ffffff;
  }

  .gumbel-lab__controls {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .gumbel-lab__controls label {
    color: #172026;
    display: grid;
    font-size: 0.85rem;
    font-weight: 700;
    gap: 0.35rem;
  }

  .gumbel-lab__controls output {
    color: #0f766e;
    font-variant-numeric: tabular-nums;
  }

  .gumbel-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .gumbel-lab__metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0.2rem 0 0.9rem;
  }

  .gumbel-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    padding: 0.62rem 0.7rem;
  }

  .gumbel-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .gumbel-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }

  .gumbel-lab canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    display: block;
    width: 100%;
  }

  .gumbel-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }

  .gumbel-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .gumbel-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .gumbel-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 760px) {
    .gumbel-lab {
      margin-left: calc(50% - 50vw + 1rem);
      margin-right: calc(50% - 50vw + 1rem);
    }

    .gumbel-lab__controls,
    .gumbel-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .gumbel-lab__controls,
    .gumbel-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="gumbel-lab" data-gumbel-race-lab>
  <div class="gumbel-lab__controls">
    <label>
      Items <output data-value="items">8</output>
      <input type="range" min="5" max="12" step="1" value="8" data-param="items">
    </label>
    <label>
      Temperature <output data-value="temp">0.85</output>
      <input type="range" min="35" max="220" step="5" value="85" data-param="temp">
    </label>
    <label>
      Sample size k <output data-value="k">4</output>
      <input type="range" min="1" max="12" step="1" value="4" data-param="k">
    </label>
    <label>
      Simulated draws <output data-value="trials">6,000</output>
      <input type="range" min="1000" max="20000" step="500" value="6000" data-param="trials">
    </label>
    <label>
      Seed <output data-value="seed">19</output>
      <input type="range" min="1" max="999" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="gumbel-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Gumbel race lab showing categorical sampling, exponential clocks, top-k sampling without replacement, and Monte Carlo audit"></canvas>
  <div class="gumbel-lab__legend">
    <span><i style="background:#172026"></i> Exact law</span>
    <span><i style="background:#2563eb"></i> Gumbel simulation</span>
    <span><i style="background:#0f766e"></i> Exponential race</span>
    <span><i style="background:#d97706"></i> With-replacement inclusion</span>
    <span><i style="background:#be123c"></i> Selected top-k order</span>
  </div>
  <p class="gumbel-lab__note">
    Deterministic synthetic experiment. The labels are toy candidate tokens.
    The first panel checks the categorical law; the second shows that Gumbel
    keys and exponential clocks sort identically; the third compares exact
    without-replacement inclusion probabilities with a Monte Carlo estimate.
  </p>
</div>

<script defer src="{{ '/assets/js/gumbel-race-lab.js?v=20260614a' | relative_url }}"></script>

With the default settings, the distribution has only about `4.63` effective
choices even though there are eight candidates. The largest candidate has
probability `47.2%`.

For `k=4`, independent with-replacement sampling would use only about `2.66`
distinct items in expectation. In other words, about `33.5%` of the sample slots
are wasted on repeats. Sorting one Gumbel key per item spends all four slots on
distinct candidates, while still favoring high-probability candidates in the
right Plackett-Luce proportions.

The numerical audit is deliberately boring:

```text
default first-pick total variation:     0.0171
default top-k inclusion mean abs error: 0.0051
clock order matches Gumbel order:       yes
```

The point is not that Monte Carlo error is zero. It is that the errors shrink
around the exact categorical and Plackett-Luce laws, and the clock/key ordering
is algebraically identical for every trial.

## Top-k, Unfortunately, Means Two Things

There is an annoying naming trap here.

In LLM decoding, "top-k sampling" often means:

```text
keep the k highest-probability tokens;
renormalize;
draw one token from that truncated distribution
```

Gumbel-top-k means something different:

```text
add one random Gumbel key to every candidate;
take the k largest noisy keys
```

The first procedure returns one token after a deterministic truncation. The
second returns a random ordered set of $$k$$ distinct candidates from the full
distribution. They answer different questions.

The decoding procedure asks, "How should I restrict the support before drawing
one continuation?" The Gumbel-top-k procedure asks, "How can I draw several
unique alternatives according to the same original weights?"

That distinction matters for sequence generation. If you need one continuation,
ordinary categorical sampling is enough. If you need a diverse list of candidate
continuations without duplicates, repeatedly sampling with replacement is a
noisy way to buy diversity. Gumbel-top-k is a cleaner primitive.

## Why Search Code Likes This

Beam search is deterministic: keep the best partial sequences under the model.
Sampling is stochastic: roll the model forward according to its probabilities.

Gumbel perturbations make a bridge between the two. If every complete sequence
has a log probability and receives an independent Gumbel perturbation, then the
top perturbed sequence is a sample from the model. The top $$k$$ perturbed
sequences are samples without replacement.

Of course, a language model has exponentially many complete sequences. You
cannot materialize every sentence, add noise, and sort. Stochastic beam search
uses structure in the sequence model to avoid doing that explicitly.[^kool] A*
sampling uses bounds and a Gumbel process to search continuous or enormous
spaces for the maximum of a random perturbation.[^astar]

The common shape is:

```text
randomness first, optimization second
```

Once the perturbations are drawn, the rest can look like search. That is a
useful engineering pattern because search code can exploit structure, pruning,
bounds, and batching, while the perturbation gives the result a sampling
interpretation.

## The Trick Still Has a Boundary

Gumbel-max is exact when the candidates you perturb are exactly the domain you
want to sample from. If you only perturb local factors in a structured model,
you generally get an approximation unless the construction preserves the right
global perturbation law. That is the warning behind perturb-and-MAP methods:
turning sampling into optimization is powerful, but the perturbation must match
the object being optimized.

It also does not make low-temperature distributions diverse. If the top item has
nearly all the mass, sampling without replacement will still include it almost
every time. The lab shows this if you lower temperature: the top candidate
dominates the first-pick law, and it remains nearly guaranteed to appear in the
top-k set. No sampling trick can create probability mass that the model did not
assign.

And it does not remove the usual numerical obligations. In real code, use stable
logits, avoid taking logs of exact zero, and remember that a Gumbel perturbation
has a heavy right tail. That tail is the whole point. Occasionally a low-weight
candidate receives a very large positive shock and wins.

## The Picture I Keep

I like the race picture because it makes several facts feel like one fact.

Temperature changes the clock rates. Lower temperature makes the fastest clock
much faster. Higher temperature makes the race more even.

Categorical sampling is the first clock.

Sampling without replacement is the order in which the clocks ring.

Gumbel noise is the log-space record of those same clocks.

That is the whole trick. A sample is not only a draw from a distribution. It can
also be the winner of a noisy optimization problem. Once you see that, a lot of
algorithms that look like separate species start to share a skeleton.

---

[^luce]: R. Duncan Luce, [*Individual Choice Behavior: A Theoretical Analysis*](https://books.google.com/books/about/Individual_Choice_Behavior.html?id=a80DAQAAIAAJ), Wiley, 1959.

[^yellott]: John I. Yellott, ["The Relationship Between Luce's Choice Axiom, Thurstone's Theory of Comparative Judgment, and the Double Exponential Distribution"](https://escholarship.org/uc/item/7z91732x), *Journal of Mathematical Psychology*, 15(2):109-144, 1977.

[^kool]: Wouter Kool, Herke van Hoof, and Max Welling, ["Stochastic Beams and Where To Find Them: The Gumbel-Top-k Trick for Sampling Sequences Without Replacement"](https://proceedings.mlr.press/v97/kool19a.html), ICML 2019.

[^astar]: Chris J. Maddison, Daniel Tarlow, and Tom Minka, ["A* Sampling"](https://papers.neurips.cc/paper/5449-a-sampling.pdf), NeurIPS 2014.
