---
layout: post
title: "The One Percent Chance Has a Price"
description: "Cumulative prospect theory is a model of how risky choices can be priced relative to a reference point, not by expected value alone."
date: 2026-06-15 16:12:00 -0400
categories: psychology
tags: [prospect-theory, behavioral-finance, decision-theory, risk, psychology, probability-weighting]
excerpt: "A lottery ticket and an insurance policy can both look expensive under expected value and still make psychological sense once outcomes are coded as gains, losses, and weighted tails."
---

Expected value is a clean ledger. Prospect theory is a dirty one.

That is not an insult. It is the point.

People do not usually meet risk as a probability distribution floating in a
vacuum. They meet it as a change from a reference point:

```text
I might win this
I might lose that
I can make this uncertainty go away
```

The sign matters. The tail matters. Certainty matters. A 1% chance is not just
`0.01` when it is the only path to a jackpot or the only path to ruin.

Kahneman and Tversky's 1979 prospect theory paper made this discomfort with
expected utility precise enough to fight about.[^kt1979] The later cumulative
version by Tversky and Kahneman repaired important theoretical problems by
weighting cumulative ranks rather than isolated probabilities, while preserving
the descriptive ingredients that made the theory bite: reference dependence,
loss aversion, diminishing sensitivity, and nonlinear probability
weighting.[^tk1992]

This post is a small lab for those ingredients. The question is not:

```text
what should a perfectly rational investor do?
```

The question is:

```text
how can the same dollar lottery acquire two different prices?
```

## A Value Function With a Scar

The canonical prospect-theory value function is drawn around a reference point,
usually zero:

```text
v(x) = x^alpha                    for gains
v(x) = -lambda * (-x)^alpha       for losses
```

When `alpha` is below 1, the function bends. The second hundred dollars matters
less than the first hundred. A second hundred-dollar loss also hurts less than
the first, but the loss side is multiplied by `lambda`. In the 1992 cumulative
prospect theory estimates, the common benchmark is `alpha = beta = 0.88` and
`lambda = 2.25`.[^tk1992]

That number is often summarized as "losses loom larger than gains." Fine, but
the slogan hides the mechanical consequence:

```text
a positive-EV mixed gamble can have a negative certainty equivalent
```

A 50/50 gamble to win $100 or lose $60 has expected value +$20. Under the
default lab parameters, its prospect-theory certainty equivalent is about
`-$7.53`. The model does not say the gamble is morally bad. It says that, for
this descriptive preference functional, the pain side of the ledger is heavy
enough to cross zero.

## Probability Is Not Used Raw

The second scar is on probability. Cumulative prospect theory uses decision
weights derived from transformed cumulative probabilities. The Tversky-Kahneman
weighting function used in the lab is:

```text
w(p) = p^gamma / (p^gamma + (1 - p)^gamma)^(1 / gamma)
```

with separate curvature parameters for gains and losses. The 1992 estimates
used `gamma = 0.61` for gains and `delta = 0.69` for losses.[^tk1992]

For tiny probabilities, this curve can sit far above the diagonal. In the lab's
default lottery case, a 1% gain tail receives decision weight `0.0553`, about
`5.53x` its objective probability. The same 1% loss tail receives decision
weight `0.0397`, about `3.97x` its probability.

This is why the old observation is so stable: small probabilities can make both
lottery tickets and insurance policies attractive.[^kt1979] The two products
look opposite in cash-flow terms, but they rhyme psychologically. Each sells a
transformation of a tail.

## The Lab

The lab below computes three ledgers for a small prospect:

- expected value in dollars;
- cumulative prospect-theory value;
- the certainty equivalent, obtained by inverting the prospect-theory value
  function back into dollars.

The model is deterministic. The audit uses a neutral parameter setting
`alpha = 1`, `lambda = 1`, `gamma = 1`, `delta = 1` to verify that the
certainty equivalent collapses back to expected value. It also checks the
default lottery, insurance, and mixed-gamble cases.

<style>
  .prospect-lab {
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

  .prospect-lab__controls {
    display: grid;
    gap: 0.78rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  }

  .prospect-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.83rem;
    font-weight: 700;
    gap: 0.34rem;
    line-height: 1.25;
    min-width: 0;
  }

  .prospect-lab__controls input,
  .prospect-lab__controls select {
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .prospect-lab__controls input {
    accent-color: #be123c;
    margin: 0;
  }

  .prospect-lab__controls select {
    appearance: none;
    background: #f8fafc;
    border: 1px solid #cbd5df;
    border-radius: 7px;
    line-height: 1.25;
    padding: 0.48rem 0.62rem;
  }

  .prospect-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 780;
  }

  .prospect-lab__case {
    border-top: 1px solid #e4eaf0;
    display: grid;
    gap: 0.2rem;
    margin-top: 0.95rem;
    padding-top: 0.85rem;
  }

  .prospect-lab__case strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1rem;
    line-height: 1.25;
  }

  .prospect-lab__case span,
  .prospect-lab__legend {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .prospect-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0.85rem 0;
  }

  .prospect-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    min-width: 0;
    padding: 0.58rem 0.62rem;
  }

  .prospect-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .prospect-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(1rem, 2.8vw, 1.28rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.16rem;
    overflow-wrap: anywhere;
  }

  .prospect-lab__canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    margin: 0.85rem 0;
    max-width: 100%;
    width: 100%;
  }

  .prospect-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.8rem;
    margin: 0.4rem 0 0;
  }

  .prospect-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
    min-width: 0;
  }

  .prospect-lab__legend i {
    border-radius: 3px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .prospect-lab__legend .is-ev {
    background: #2563eb;
  }

  .prospect-lab__legend .is-cpt {
    background: #be123c;
  }

  .prospect-lab__legend .is-gain {
    background: #0f766e;
  }

  .prospect-lab__legend .is-loss {
    background: #b45309;
  }

  @media (max-width: 520px) {
    .prospect-lab {
      padding: 0.75rem;
    }

    .prospect-lab__canvas {
      height: 720px;
    }
  }
</style>

<div class="prospect-lab" data-prospect-lab data-scenario="lottery" data-probability="1" data-gain="200" data-loss="2" data-alpha="88" data-lambda="225" data-gamma="61" data-delta="69"></div>

<script src="{{ '/assets/js/prospect-theory-lab.js?v=20260615b' | relative_url }}"></script>

## Three Things to Try

First, leave the lab on **Lottery ticket**. The default ticket costs $2 and has
a 1% chance of paying a $200 jackpot, so its expected value is exactly zero:

```text
0.01 * 198 - 0.99 * 2 = 0
```

The prospect-theory certainty equivalent is about `$2.06`. That is not a claim
that buying fair lottery tickets is a wealth-maximizing strategy. It is a claim
about a descriptive ledger where the salient gain tail receives more decision
weight than its raw probability.

Second, switch to **Insurance quote**. The default case is a 1% chance of a
$200 loss. Expected loss is `$2.00`, but the prospect-theory certainty
equivalent of carrying the risk is about `-$5.11`. In this descriptive model, a
$2 quote is cheap relative to the pain-weighted risk, and the maximum premium
that would make the person indifferent is about `$5.11`.

Third, switch to **Mixed gamble**, set the probability to 50%, gain to 100, and
loss to 60. Expected value is `$20.00`, but the default prospect-theory
certainty equivalent is about `-$7.53`. Now reduce **Loss aversion** from 225%
to 100%. The certainty equivalent turns positive.

That last slider is the cleanest way to see why "risk aversion" is not one
thing. Probability curvature, value curvature, and loss aversion can point in
different directions.

## The Fourfold Pattern Is a Local Weather Report

Prospect theory is often taught through the fourfold pattern:

```text
high-probability gains:        risk averse
high-probability losses:       risk seeking
low-probability gains:         risk seeking
low-probability losses:        risk averse
```

This pattern is not a universal law of every human at every stake. It is a
compact way to remember how the value curve and probability-weighting curve
interact. In the 1979 paper, the certainty effect helped explain why people
often prefer a sure gain to a larger probable gain, while the reflection effect
showed a mirror-image appetite for risk over losses.[^kt1979]

The cumulative version adds a rank-dependent correction: for multi-outcome
prospects, the model transforms cumulative probabilities, not each isolated
probability separately. This matters because independently weighting each
outcome can violate stochastic dominance. The rank-dependent construction is
part of why cumulative prospect theory became the standard version to use in
formal modeling.[^tk1992]

The lab keeps the examples small enough to inspect, but it uses that cumulative
decision-weight logic: gains are ranked from best down, losses from worst up,
and the decision weight is the difference between two transformed cumulative
ranks.

## This Is Not a Permission Slip

There is a common bad use of prospect theory:

```text
people overweight small probabilities,
therefore the product is fine
```

No. A descriptive model is not a welfare theorem.

The fact that a tail is psychologically heavy does not mean the person is
making a mistake, and it also does not mean the seller is innocent. Insurance
can be prudent risk transfer. Lotteries can be entertainment, exploitation, or a
tiny purchased fantasy, depending on the institution around them. A positive
prospect-theory value is a statement about a model of choice, not a statement
about social value.

This distinction matters in finance too. If an investor dislikes losses relative
to a reference point, then path shape, drawdown framing, and statement
frequency can change behavior even when terminal wealth distributions look
similar. A model that prices only terminal expected wealth will miss that
interface. A model that prices only feelings will miss the budget constraint.

The right posture is not to replace expected value with prospect theory. It is
to keep both ledgers visible.

## What the Audit Checks

The JavaScript audit is deliberately small:

- with neutral parameters, certainty equivalent equals expected value;
- the default lottery has zero expected value and positive prospect certainty
  equivalent;
- the 1% gain tail is overweighted;
- the default insurance case has expected loss `$2.00`, but a larger maximum
  premium;
- the positive-EV mixed gamble is rejected under default loss aversion;
- lowering loss aversion can make that same mixed gamble acceptable;
- malformed inputs are clamped to valid parameter ranges;
- the certainty equivalent really inverts the prospect-theory value function.

Default facts from the shipped lab:

```json
{
  "scenario": "lottery",
  "expectedValue": 0,
  "certaintyEquivalent": 2.06,
  "gainTailWeight": 0.0553,
  "gainTailMultiplier": 5.53,
  "lossTailWeight": 0.0397,
  "lossTailMultiplier": 3.97
}
```

The one-percent chance has a price. The tricky part is noticing which ledger is
quoting it.

[^kt1979]: Daniel Kahneman and Amos Tversky, ["Prospect Theory: An Analysis of Decision under Risk"](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Kahneman_Tversky_1979_Prospect_theory.pdf), *Econometrica*, 1979.

[^tk1992]: Amos Tversky and Daniel Kahneman, ["Advances in Prospect Theory: Cumulative Representation of Uncertainty"](https://cemi.ehess.fr/docannexe/file/2780/tversjy_kahneman_advances.pdf), *Journal of Risk and Uncertainty*, 1992. Bibliographic listing: [SCI Utah library page](https://www.sci.utah.edu/~kpotter/Library/Papers/tversky%3A1992%3AAPTU/index.html).
