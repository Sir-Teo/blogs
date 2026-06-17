---
layout: post
title: "The Max Has a Temperature"
description: "Entropy-regularized control does not merely add random exploration after planning. It changes the Bellman backup itself: max becomes log-sum-exp."
date: 2026-06-16 23:51:00 -0400
categories: machine-learning
tags: [reinforcement-learning, entropy-regularization, soft-bellman, soft-q-learning, control-as-inference, dynamic-programming, machine-learning]
excerpt: "A hard Bellman backup asks which action wins. A soft Bellman backup asks how much probability each near-winner deserves."
---

The usual Bellman backup has a tiny courtroom inside it:

```text
bring me every action
score each future
keep the largest
```

For a discounted Markov decision process, that courtroom is usually written as
the Bellman optimality backup:[^bellman]

$$
V(s) = \max_a \left\{ r(s,a) + \gamma \mathbb{E}[V(s') \mid s,a] \right\}.
$$

That `max` is decisive. It is also brittle. If two actions are nearly tied, the
backup still returns one winner. If the model is a little wrong, the winner can
flip. If the policy needs to keep several competent behaviors alive, the hard
maximum has already thrown most of them away.

Entropy-regularized control changes the courtroom rule:

$$
V_\alpha(s)
= \alpha \log \sum_a \exp(Q(s,a)/\alpha).
$$

The policy implied by the same backup is

$$
\pi_\alpha(a \mid s)
= \frac{\exp(Q(s,a)/\alpha)}
        {\sum_b \exp(Q(s,b)/\alpha)}.
$$

The max has a temperature.

As $$\alpha \to 0$$, log-sum-exp becomes the hard maximum. At larger
$$\alpha$$, near-winners keep probability mass. That is not epsilon-greedy
exploration bolted on after planning. It is a different dynamic program.

## The Temperature Is Paid In Reward Units

The most important practical detail is also the easiest one to miss:

```text
temperature and reward scale are the same knob in different clothes
```

If every reward is multiplied by ten and $$\alpha$$ is left alone, the policy
gets sharper. If $$\alpha$$ is multiplied by ten and rewards are left alone,
the policy gets softer. Soft Actor-Critic made this operational in deep RL:
the maximum-entropy objective optimizes expected reward plus an entropy term,
and the temperature controls how much stochasticity survives in the optimal
policy.[^sac]

This is why "turn up exploration" is not a clean sentence. The agent is not
sprinkling noise over a fixed plan. It is solving a planning problem where
randomness itself earns or costs value.

Geist, Scherrer, and Pietquin put the modern abstraction cleanly: regularized
MDPs can be built by replacing the ordinary Bellman operator with a regularized
Bellman operator, and the Legendre-Fenchel transform supplies the smoothed
maximum.[^geist] For negative entropy, the smoothed maximum is the familiar
log-sum-exp.

So the soft backup is not a trick for neural networks. It is a tabular object
before any neural network appears.

## The Lab

The little world below has one start state and two terminal goals:

```text
A reward: 10.00
B reward:  9.55
step cost: -0.04
slip:       8%
gamma:      0.96
```

The hard optimal policy almost always ends at `A`, because `A` is slightly
better. The soft policy is allowed to keep some probability on the near-tie
route to `B`.

At the default setting, with $$\alpha = 0.15$$:

```text
top goal A          82.3%
bottom goal B       17.7%
hard-max A rate     99.9%
start entropy        1.25 nats
extrinsic return     5.27
entropy term         1.30
soft value bonus     0.56
```

The start-state soft policy is not a single arrow:

```text
up     34.8%
right  40.1%
down   11.5%
left   13.7%
```

That is the point. The policy remembers the alternatives because the backup
remembered them.

<style>
  .soft-bellman-lab {
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

  .soft-bellman-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin-bottom: 1rem;
  }

  .soft-bellman-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .soft-bellman-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .soft-bellman-lab input {
    accent-color: #2563eb;
    width: 100%;
  }

  .soft-bellman-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .soft-bellman-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .soft-bellman-lab__metric.good {
    border-color: #9ed8c5;
  }

  .soft-bellman-lab__metric span,
  .soft-bellman-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .soft-bellman-lab__metric span {
    display: block;
  }

  .soft-bellman-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .soft-bellman-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .soft-bellman-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .soft-bellman-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .soft-bellman-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .soft-bellman-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .soft-bellman-lab {
      padding: 0.75rem;
    }

    .soft-bellman-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="soft-bellman-lab" class="soft-bellman-lab" data-soft-bellman-lab>
  <div class="soft-bellman-lab__controls">
    <label>
      Temperature alpha: <output data-value="alpha">0.15</output>
      <input type="range" min="5" max="60" step="1" value="15" data-param="alpha">
    </label>
    <label>
      Goal gap A-B: <output data-value="gap">0.45</output>
      <input type="range" min="0" max="250" step="5" value="45" data-param="gap">
    </label>
    <label>
      Reward scale: <output data-value="rewardScale">100%</output>
      <input type="range" min="35" max="220" step="5" value="100" data-param="rewardScale">
    </label>
    <label>
      Slip probability: <output data-value="slip">8%</output>
      <input type="range" min="0" max="35" step="1" value="8" data-param="slip">
    </label>
    <label>
      Discount gamma: <output data-value="gamma">0.96</output>
      <input type="range" min="80" max="99" step="1" value="96" data-param="gamma">
    </label>
    <label>
      Rollouts: <output data-value="episodes">900</output>
      <input type="range" min="120" max="1800" step="60" value="900" data-param="episodes">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="999" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="soft-bellman-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Soft Bellman backup lab showing a grid policy, start-state action values, rollout outcomes, and a temperature sweep"></canvas>
  <div class="soft-bellman-lab__legend">
    <span><i style="background:#0f766e"></i> Goal A / occupancy</span>
    <span><i style="background:#7c3aed"></i> Goal B</span>
    <span><i style="background:#2563eb"></i> Soft policy</span>
    <span><i style="background:#64748b"></i> Hard max</span>
    <span><i style="background:#be123c"></i> Timeout</span>
  </div>
  <p class="soft-bellman-lab__note">
    Deterministic tabular solver plus seeded Monte Carlo rollouts. The solver
    runs hard and entropy-regularized value iteration on the same small MDP,
    then samples trajectories from the soft policy. Reward scale multiplies the
    rewards used by the Bellman backup; reported return is unscaled extrinsic
    reward.
  </p>
</div>
<script defer src="{{ '/assets/js/soft-bellman-lab.js?v=20260616a' | relative_url }}"></script>

Try four moves.

First, lower **Temperature alpha**. The policy sharpens, and goal `A` dominates.
At `alpha = 0.05`, the sweep shows `A` around `96%` of rollouts. This is the
hard-max world returning through the side door.

Second, set **Goal gap A-B** to zero. Now the two terminal rewards are tied. The
hard policy's tie-breaking is arbitrary, but the soft policy can represent the
symmetry as probability mass.

Third, raise **Reward scale**. The displayed temperature did not move, but the
effective temperature fell because the action-value gaps got larger in reward
units. This is the same reason SAC implementations care about reward scaling:
it changes the stochasticity of the energy-based policy.[^sac]

Fourth, raise **Temperature alpha** too far. The entropy line saturates near
`log(4)`, and the top-goal probability collapses. That is not a bug. A
maximum-entropy objective can make dithering valuable if the temperature is
large relative to the task rewards and horizon. Randomness is not free; it has
been placed inside the objective.

## Soft Is Not Always Better

The soft backup has a seductive story:

```text
keep near-optimal modes alive
avoid brittle argmax flips
explore without bolting noise onto a deterministic policy
```

All three are real. None is a license to forget the objective.

The hard maximum answers:

```text
what is the best action if the model and reward are exactly right?
```

The soft maximum answers:

```text
what distribution trades reward against entropy at this temperature?
```

Those are different questions. A temperature that is wonderful during learning
can be too random for deployment. A reward scale that looks harmless in a code
cleanup can silently change the effective policy. A stochastic policy that
covers multiple modes can also keep revisiting bad states because entropy is
being paid every step.

This is why I prefer to write the backup explicitly in design docs. If the
algorithm is doing

$$
\alpha \log \sum_a \exp(Q(s,a)/\alpha)
$$

then the review should ask for $$\alpha$$, reward units, discount, horizon, and
the deployment policy. The "exploration knob" is part of the theorem.

## Control As Inference, In One Sentence

There is a deeper reason this form keeps appearing. Exponentials turn sums of
rewards into weights over trajectories.

Ziebart, Maas, Bagnell, and Dey's maximum entropy inverse reinforcement learning
paper used a globally normalized distribution over decision sequences to model
noisy route behavior.[^ziebart] Instead of declaring one path optimal, the model
keeps a probability distribution over paths, with higher-reward paths receiving
more mass.

Todorov's linearly-solvable MDPs take a related control-theoretic route: control
rescales passive dynamics, and a KL-divergence control cost makes a transformed
Bellman equation linear.[^todorov] That is not the same algorithm as the toy lab
above, but it shares the same smell: reward, probability, and relative entropy
are not separate bookkeeping systems. They can be one planning language.

The compact memory hook is:

```text
hard Bellman: choose the best future
soft Bellman: price a distribution over futures
```

That one change explains why soft Q-learning, SAC, KL-control, path-integral
control, and maximum-entropy imitation learning keep talking to one another.

## The Audit I Want

Before trusting a maximum-entropy controller, I want the following written down:

```text
What units are rewards in?
What value of alpha or target entropy is being used?
Was reward scaling changed during preprocessing or environment wrapping?
Is the learned policy deployed stochastically, greedily, or with another temperature?
Does entropy reward continue after the task is effectively over?
Are there near-tie modes that should remain alive for robustness or diversity?
Are there loops where entropy can be collected without task progress?
```

The last line is the uncomfortable one. Entropy regularization can be a principled
way to avoid premature commitment. It can also turn indecision into income.

The max has a temperature. That makes it smoother, more expressive, and easier
to misuse.

[^bellman]: Richard Bellman, ["On the Theory of Dynamic Programming"](https://pubmed.ncbi.nlm.nih.gov/16589166/), *Proceedings of the National Academy of Sciences* 38(8):716-719, 1952. DOI: [10.1073/pnas.38.8.716](https://doi.org/10.1073/pnas.38.8.716).

[^ziebart]: Brian D. Ziebart, Andrew Maas, J. Andrew Bagnell, and Anind K. Dey, ["Maximum Entropy Inverse Reinforcement Learning"](https://www.cs.cmu.edu/~bziebart/publications/maximum-entropy-inverse-reinforcement-learning.pdf), AAAI 2008.

[^todorov]: Emanuel Todorov, ["Linearly-solvable Markov decision problems"](https://papers.nips.cc/paper_files/paper/2006/hash/d806ca13ca3449af72a1ea5aedbed26a-Abstract.html), NeurIPS 2006.

[^sac]: Tuomas Haarnoja, Aurick Zhou, Pieter Abbeel, and Sergey Levine, ["Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor"](https://proceedings.mlr.press/v80/haarnoja18b.html), ICML 2018.

[^geist]: Matthieu Geist, Bruno Scherrer, and Olivier Pietquin, ["A Theory of Regularized Markov Decision Processes"](https://proceedings.mlr.press/v97/geist19a.html), ICML 2019.
