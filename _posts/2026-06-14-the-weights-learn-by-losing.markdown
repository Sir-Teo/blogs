---
layout: post
title: "Mistakes Burn Capital"
description: "Multiplicative weights is a loss ledger with teeth: every expert keeps capital, bad rounds shrink it, and the learner gets a certificate against a named comparator."
date: 2026-06-14 17:13:00 -0400
categories: machine-learning
tags: [multiplicative-weights, hedge, online-learning, regret, boosting, game-theory, algorithms]
excerpt: "Keep a distribution, observe losses, multiply bad experts down. The interesting part is not the update. It is the receipt it leaves behind."
---

The algorithm is almost too small to deserve its reputation.

Keep a weight for each adviser. Ask them all what to do. Lose a little. Multiply
the weights of the advisers that lost more. Repeat.

That is the multiplicative weights update method. It is a voting rule, a
portfolio rule, an online-learning rule, a game-playing rule, and one of the
quiet engines inside boosting. Arora, Hazan, and Kale describe it as a
meta-algorithm: maintain a distribution over a set, update the distribution
multiplicatively, then analyze the whole process with an exponential
potential.[^ahk]

The surprising thing is not that the algorithm works in friendly worlds. The
surprising thing is that it gives a useful receipt in hostile ones.

You can feed it losses chosen after the learner has already placed its weight.
You can make one adviser look brilliant for a while, then punish anyone who
trusted it. You can make the best strategy visible only in hindsight. The
learner may look gullible round by round, but its cumulative loss is pinned
close to the loss of the best fixed adviser after the fact.

That is a very particular kind of intelligence:

```text
not "I know the future"
but "I will not pay much more than the best constant story I could have told"
```

## A Ledger With Teeth

Suppose there are `N` experts. On round `t`, the learner has nonnegative weights
`w_t,i`. It turns them into probabilities:

```text
p_t,i = w_t,i / sum_j w_t,j
```

Then the world reveals a loss vector:

```text
loss_t,i in [0, 1]
```

The learner pays the mixture loss:

```text
sum_i p_t,i loss_t,i
```

and updates:

```text
w_{t+1,i} = w_{t,i} exp(-eta loss_t,i)
```

Bad losses do not subtract capital. They shrink it by a factor. That one
choice is the entire personality of the method.

If an expert loses `0`, its weight is unchanged. If it loses `1`, its weight is
multiplied by `exp(-eta)`. If it repeatedly loses, the punishment compounds.
The learner is not averaging scores in a notebook. It is moving probability
mass away from explanations that keep costing it.

For losses in `[0, 1]`, this version of exponential weights satisfies a compact
certificate:

```text
L_algorithm <= min_i L_i + log(N) / eta + eta T / 8
```

where `T` is the number of rounds, `L_algorithm` is the learner's cumulative
mixture loss, and `min_i L_i` is the cumulative loss of the best single expert
chosen in hindsight.

The two extra terms are the price of not knowing:

```text
log(N) / eta   pays for searching among experts
eta T / 8      pays for being aggressive with noisy evidence
```

Make `eta` tiny and the learner is polite, slow, and pays a large search tax.
Make `eta` huge and it moves fast, but can overreact to early noise. The
theorem is not a magic learning-rate oracle. It is a tradeoff written on the
receipt.

## The Hedge Lab

The lab below implements the full-information Hedge update with log-weights for
numerical stability. Each expert receives a synthetic loss every round. The
learner pays the probability-weighted loss, updates all expert weights, and
plots both the actual regret and the theorem's certificate line.

The default scenario is deliberately mean. Expert `E1` is excellent early, then
becomes bad. Expert `E2` is boring and steady. With the default seed, `E1` ends
around `95.53` cumulative loss, `E2` wins in hindsight at `55.79`, and Hedge
pays `61.78`. That is `5.99` regret against the best fixed expert, beneath a
certificate gap of `13.43`; by the end, `99.995%` of the weight sits on `E2`.

In other words: it gets fooled, notices, and still keeps the bill bounded.

I also audited the lab as code, not just as a picture. Across `972` combinations
of scenario, learning rate, expert count, horizon, noise, and seed, every run
kept finite losses, nonnegative weights, probabilities summing to one, and
regret below the displayed certificate gap. The default sweep is doing what the
theorem says it should: small `eta` is sluggish, huge `eta` is jumpy, and the
middle of the plot is where the rent gets negotiated.

<style>
  .mw-lab {
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

  .mw-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .mw-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .mw-lab__controls input,
  .mw-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .mw-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .mw-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .mw-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .mw-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .mw-lab__metric span,
  .mw-lab__legend,
  .mw-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .mw-lab__metric span {
    display: block;
  }

  .mw-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .mw-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .mw-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .mw-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .mw-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .mw-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .mw-lab {
      padding: 0.82rem;
    }

    .mw-lab__controls,
    .mw-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .mw-lab canvas {
      height: 1100px;
    }
  }
</style>

<div class="mw-lab" data-multiplicative-weights-lab>
  <div class="mw-lab__controls">
    <label>
      Scenario <output data-value="scenario">early winner turns bad</output>
      <select data-param="scenario" aria-label="Loss scenario">
        <option value="decoy" selected>early winner turns bad</option>
        <option value="stationary">one expert is quietly best</option>
        <option value="shifting">the best expert changes</option>
        <option value="adversary">penalize the crowd</option>
      </select>
    </label>
    <label>
      Learning rate <output data-value="eta">0.35</output>
      <input type="range" min="5" max="100" step="1" value="35" data-param="eta" aria-label="Learning rate">
    </label>
    <label>
      Experts <output data-value="experts">7</output>
      <input type="range" min="3" max="12" step="1" value="7" data-param="experts" aria-label="Expert count">
    </label>
    <label>
      Rounds <output data-value="rounds">180</output>
      <input type="range" min="60" max="360" step="5" value="180" data-param="rounds" aria-label="Round count">
    </label>
    <label>
      Loss noise <output data-value="noise">12%</output>
      <input type="range" min="0" max="35" step="1" value="12" data-param="noise" aria-label="Loss noise">
    </label>
    <label>
      Seed <output data-value="seed">43</output>
      <input type="range" min="1" max="9999" step="1" value="43" data-param="seed" aria-label="Random seed">
    </label>
  </div>
  <div class="mw-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Multiplicative weights Hedge lab showing cumulative loss, final expert weights, loss stream, and learning-rate sweep"></canvas>
  <div class="mw-lab__legend">
    <span><i style="background:#2563eb"></i>Algorithm loss</span>
    <span><i style="background:#0f766e"></i>Best fixed expert</span>
    <span><i style="background:#be123c"></i>Regret certificate</span>
    <span><i style="background:#b45309"></i>Expert loss</span>
    <span><i style="background:#7c3aed"></i>Eta sweep</span>
  </div>
  <p class="mw-lab__note">
    Deterministic toy model. Losses are bounded in [0, 1], the learner sees all
    expert losses after each round, and the certificate is for the best fixed
    expert in hindsight.
  </p>
</div>

<script defer src="{{ '/assets/js/multiplicative-weights-lab.js?v=20260614a' | relative_url }}"></script>

Try the four scenarios as different adversaries.

**One expert is quietly best** is the friendly case. The learner should drift
toward the lowest-loss expert, and the regret line becomes a small tax on not
knowing the answer from the start.

**Early winner turns bad** is the default. This is the most useful cautionary
case because the final top weight is nearly all on `E2`, even though `E1`
looked attractive early. Multiplicative weights is not loyal. It remembers in
capital, and capital can flee.

**The best expert changes** usually looks better than it deserves. The fixed
expert comparator is weak in a changing world: if `E1` is best early, `E4` is
best later, and `E7` is best at the end, the theorem does not promise to track
that switching sequence. For that you need a richer comparator class, such as
tracking the best expert with a limited number of switches. Same update spirit,
different receipt.

**Penalize the crowd** makes the environment attack the expert with the largest
current probability. This is the game-theoretic cartoon. A deterministic leader
is exploitable; a distribution is harder to pin down. The algorithm's safety
comes from randomization and accounting, not from discovering a permanently
correct expert.

## Why Multiplication Is the Right Kind of Forgetting

Additive penalties are tempting:

```text
score_i = score_i - loss_i
```

Then pick the best score. This is often fine when the score differences are
small and the world is gentle. But additive bookkeeping does not naturally
produce a probability distribution, and it does not treat repeated evidence as
compound evidence.

Multiplication does.

Write the log-weight after `T` rounds:

```text
log w_{T,i} = log w_{0,i} - eta L_i
```

So final weight is proportional to:

```text
exp(-eta L_i)
```

That is a soft minimum over cumulative losses. The learner does not commit to
the current champion; it keeps a Gibbs-like distribution over explanations,
where `eta` controls how sharply loss is converted into probability.

This is why the method keeps reappearing. In online prediction, the experts are
forecasters. In portfolio selection, they are assets or strategies. In game
playing, they are actions. In boosting, a related exponential reweighting
emphasizes training examples that the current ensemble still mishandles.
Freund and Schapire's Hedge paper frames the core problem as dynamically
apportioning resources among options under worst-case online losses, and then
connects that logic to boosting.[^fs]

The object changes. The ledger stays.

## The Bound Is Not a Vibe

The proof is short enough to keep in your head.

Let:

```text
W_t = sum_i w_t,i
```

This total weight is the potential. Initially, if all weights are `1`, then
`W_0 = N`.

On a round, the update gives:

```text
W_{t+1} = sum_i w_t,i exp(-eta loss_t,i)
```

Normalize by `W_t`:

```text
W_{t+1} / W_t = sum_i p_t,i exp(-eta loss_t,i)
```

For bounded losses, Hoeffding's lemma controls this exponential average by the
mixture loss plus a curvature term:

```text
log(W_{t+1} / W_t) <= -eta learner_loss_t + eta^2 / 8
```

Sum over rounds:

```text
log W_T <= log N - eta L_algorithm + eta^2 T / 8
```

Now lower-bound the same final potential by any single expert's remaining
weight:

```text
W_T >= w_{T,i} = exp(-eta L_i)
```

For the best fixed expert:

```text
-eta min_i L_i <= log W_T
```

Put the upper and lower bounds on `log W_T` together, rearrange, and the
certificate appears:

```text
L_algorithm <= min_i L_i + log(N) / eta + eta T / 8
```

There is no distributional assumption hiding here. The losses can be generated
by a stochastic process, a market, a benchmark suite, a player, or a cranky
script that looks at your current weights before deciding whom to punish. The
price is that the guarantee is relative to the comparator you named.

That last sentence matters.

## Regret Is Always Regret To Something

"No regret" is an incomplete phrase.

No regret to the best fixed expert is different from no regret to the best
sequence of experts. It is different from no regret to a policy that observes
state. It is different from low loss in absolute terms. An algorithm can have
small regret and still be terrible if every expert is terrible.

This is the most common abuse of online-learning language in product work. A
team says the selector has low regret, but the comparator class is too weak to
mean what the business question needs.

Examples:

```text
ad ranking        best fixed ranker is weaker than a context-aware policy
model routing     best fixed model is weaker than routing by query type
market making     best fixed spread is weaker than state-dependent inventory control
game AI           best fixed action is weaker than a strategy over board states
```

The lab's shifting scenario is a small version of this mistake. The theorem is
true, and the guarantee is still useful, but it answers a narrower question:

```text
How much worse was the learner than the best single expert after the fact?
```

If the desired comparator changes over time, the algorithm has to pay for that
extra freedom somewhere: switch costs, sleeping experts, specialist experts,
contextual policies, or another structure that describes the richer benchmark.

Regret is not humility unless you say who you are comparing yourself to.

## Why This Still Feels Modern

The first Weighted Majority work was about prediction from a pool of algorithms:
combine many imperfect advisers, make few mistakes if one of them is good, and
do this online.[^lw] Hedge generalized the loss model and helped make the
connection to boosting explicit.[^fs] The Arora-Hazan-Kale survey then showed
how the same update template runs through algorithms, game theory, machine
learning, optimization, and approximate solving.[^ahk]

That lineage is old enough to be classic and current enough to remain useful.

A lot of modern systems are expert problems in disguise:

```text
Which retriever should answer this query?
Which model should handle this request?
Which cache admission policy should get traffic?
Which market signal should size risk today?
Which heuristic should guide search in this part of the game tree?
```

The full system may need features, delayed feedback, off-policy evaluation,
guardrails, and cost constraints. Fine. But the first useful baseline is often
still the little ledger:

```text
assign probability
observe bounded loss
multiply down what hurt
check regret against a named comparator
```

It is not glamorous. It is better than that. It is auditable.

## What the Lab Leaves You With

The lesson is not "use eta equals 0.35." That number is just a knob in a toy.

The lesson is that multiplicative weights separates three questions that are
often blended together:

```text
What did the learner pay?
What did the best comparator pay?
How much extra did ignorance and adaptivity cost?
```

That third number is the algorithm's rent.

When the rent is small, the aggregate learner has done its job. When the rent
is large, the lab gives you suspects: too many experts, too short a horizon,
too much noise, too aggressive a learning rate, or a comparator class that does
not match the world.

And when all experts lose badly, the method gives you no romance. It says:
your ensemble was well managed, and your ensemble was still bad.

That is a useful kind of honesty.

[^lw]: Nick Littlestone and Manfred K. Warmuth, ["The Weighted Majority Algorithm"](https://mwarmuth.bitbucket.io/pubs/J24.pdf), *Information and Computation* 108(2), 1994.

[^fs]: Yoav Freund and Robert E. Schapire, ["A Decision-Theoretic Generalization of On-Line Learning and an Application to Boosting"](https://www.schapire.net/papers/FreundSc95.pdf), *Journal of Computer and System Sciences* 55, 1997.

[^ahk]: Sanjeev Arora, Elad Hazan, and Satyen Kale, ["The Multiplicative Weights Update Method: A Meta-Algorithm and Applications"](https://theoryofcomputing.org/articles/v008a006/), *Theory of Computing* 8(6), 2012.
