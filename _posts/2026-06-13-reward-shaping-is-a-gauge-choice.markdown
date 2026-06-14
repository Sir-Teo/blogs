---
layout: post
title: "Reward Shaping, Gauge Freedom Included"
description: "Potential-based reward shaping can make reinforcement learning easier without changing the task. Arbitrary shaping can quietly create a new game."
date: 2026-06-13 22:10:00 -0400
categories: machine-learning
tags: [reinforcement-learning, reward-shaping, mdp, value-iteration, reward-design, machine-learning]
excerpt: "A reward hint is only safe when it changes the coordinates of value, not the ordering of actions. Potential-based shaping is the rare reward hack with a theorem."
---

A reward is not the objective.

It is the interface to the objective.

That distinction is easy to forget in reinforcement learning. The agent does
not see our intention. It sees numbers. If the numbers are sparse, learning is
slow. If the numbers are dense but wrong, learning is fast in the wrong
direction.

Reward shaping is the art of adding extra numbers without changing the task.
That sounds impossible. Usually it is.

The exception is beautiful.

Potential-based reward shaping adds a hint that behaves like a change of
coordinates. It can move value around the state space, but it does not change
which action is best. In physics language, it is a gauge choice. In engineering
language, it is the difference between a progress signal and a bug report from
the future.

## The Unsafe Version

Start with a discounted Markov decision process. In a state `s`, the agent takes
action `a`, lands in `s_next`, receives reward `R`, and discounts future reward
by `gamma`.

The tempting move is:

```text
R_shaped(s, a, s_next) = R(s, a, s_next) + hint(s, a, s_next)
```

If `hint` is arbitrary, this is not a training trick. It is a different MDP.
Maybe the new MDP has the same optimal policy. Maybe it does not. There is no
reason for the argmax to survive.

This is why reward shaping has always been both useful and dangerous. Sparse
tasks are painful: Randlov and Alstrom's bicycle-control work is a good
historical example of how much shaping can matter when the useful signal is
rare and the dynamics are unforgiving.[^randlov] But a dense signal is not
automatically a faithful signal. It can pay the agent for the path marker
instead of the destination.

## The Gauge Version

Ng, Harada, and Russell gave the clean answer in their 1999 ICML paper on
policy invariance.[^ng] Choose any bounded potential function `Phi` over states.
Add this shaping term:

```text
F(s, s_next) = gamma * Phi(s_next) - Phi(s)
```

Then:

```text
R_shaped(s, a, s_next) = R(s, a, s_next) + F(s, s_next)
```

Along a trajectory, the shaping rewards telescope:

```text
F_0 + gamma F_1 + gamma^2 F_2 + ...

= [gamma Phi(s_1) - Phi(s_0)]
  + gamma [gamma Phi(s_2) - Phi(s_1)]
  + gamma^2 [gamma Phi(s_3) - Phi(s_2)]
  + ...

= -Phi(s_0)
```

The middle terms cancel. For an infinite discounted process with bounded
potential, the far tail vanishes. For an episodic process, set terminal
potential to zero and the same intuition holds.

So the shaped return differs from the original return by a quantity that
depends on the starting state, not on the first action. For every action in the
same state, the offset is the same.

```text
Q_shaped(s, a) = Q_base(s, a) - Phi(s)
```

The action rankings are unchanged. The values live in a different coordinate
system, but the greedy policy is the same.

That is the whole trick.

It is also close to the boundary. Ng, Harada, and Russell show that, apart from
positive affine transformations of reward, potential differences are the
structure that gives this invariance guarantee in general. Wiewiora, Cottrell,
and Elkan later extended the idea toward state-action advice and connected
look-ahead advice to Q-value initialization.[^wiewiora] The recurring theme is
the same: advice must preserve the decision problem, not merely make numbers
larger near things we like.

## A Gridworld That Cheats Back

The lab below solves a small deterministic gridworld with value iteration.

The base task is boring on purpose:

```text
start at S
reach G
pay a small step cost
avoid walls
```

The potential hint is distance-to-goal:

```text
Phi(s) = -0.18 * ManhattanDistance(s, G)
```

Moving toward the goal tends to receive a positive shaping increment. Moving
away tends to receive a negative one. But because the increment is exactly
`gamma Phi(s_next) - Phi(s)`, value iteration should find the same greedy action
sets as the base problem.

The bad hint pays a local bonus for entering `B`, the beacon square. That is
not a potential difference. It can create a profitable loop.

<style>
  .reward-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .reward-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .reward-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .reward-lab__controls select,
  .reward-lab__controls input[type="range"] {
    width: 100%;
  }

  .reward-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .reward-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }

  .reward-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .reward-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .reward-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .reward-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .reward-lab__metric span,
  .reward-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .reward-lab__metric span {
    display: block;
  }

  .reward-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .reward-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .reward-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div class="reward-lab" data-reward-shaping-lab>
  <div class="reward-lab__controls">
    <label>
      Reward mode
      <select data-param="mode">
        <option value="base">Base reward only</option>
        <option value="potential" selected>Potential distance hint</option>
        <option value="bonus">Non-potential beacon bonus</option>
      </select>
    </label>
    <label>
      Discount
      <select data-param="gamma">
        <option value="0.85">0.85</option>
        <option value="0.9">0.90</option>
        <option value="0.95" selected>0.95</option>
        <option value="0.99">0.99</option>
      </select>
    </label>
    <label>
      Beacon bonus: <output data-bonus-readout>0.45</output>
      <input type="range" min="0" max="0.8" step="0.05" value="0.45" data-param="bonus">
    </label>
  </div>
  <div class="reward-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="520" aria-label="Reward shaping gridworld showing value iteration policy changes under potential-based and non-potential shaping"></canvas>
  <p class="reward-lab__note">
    The arrows are greedy actions after value iteration. The orange or red trace
    follows the first greedy action from S. Walls are dark, G is terminal, and B
    is the beacon used by the bad shaping reward.
  </p>
</div>
<script defer src="{{ '/assets/js/reward-shaping-lab.js?v=20260613a' | relative_url }}"></script>

Start on **Potential distance hint**. The metric that matters is `policy
changes`. It should be zero. The shaped values are different, but the greedy
action sets match the base reward. The `gauge error` is the numerical check of:

```text
Q_shaped(s, a) - Q_base(s, a) + Phi(s) = 0
```

Now switch to **Non-potential beacon bonus**. With the default bonus and
`gamma = 0.95`, the trace reaches `B`, steps away, returns to `B`, and loops.
The agent is not confused. It is optimizing exactly what we paid it to optimize.

Turn the beacon bonus down to zero. The policy returns to the base task. The
lesson is not "never add dense rewards." The lesson is:

```text
If the shaping reward has positive discounted circulation around a cycle,
the agent may learn the cycle.
```

Potential-based shaping has zero circulation in this discounted sense. Go
around a closed loop and the shaped rewards cancel as a telescoping difference.
The beacon bonus does not cancel. It accumulates.

## What This Means in Practice

Reward shaping is often described as injecting domain knowledge. That phrase is
too gentle. It sounds like giving the agent a map. Sometimes it is giving the
agent a second objective.

A safe workflow is more mechanical:

1. Write down the native reward you are unwilling to change.
2. If you add a progress signal, express it as a potential difference.
3. Verify policy invariance on small exact MDPs when you can.
4. Search for positive-reward cycles introduced by the shaping term.
5. Treat every non-potential shaping reward as a new objective until proven
   otherwise.

The potential `Phi` can still be bad as advice. It can be noisy, expensive, or
too weak to help exploration. The theorem does not promise fast learning. It
promises something narrower and more valuable:

```text
If the agent solves the shaped MDP, it has solved the original MDP.
```

That is a rare kind of software contract.

It lets you make the feedback denser without moving the goal.

## A Small Mental Model

Think of value as a height field over states.

Potential shaping tilts your coordinate system. It can make downhill steps
look numerically clearer during learning, but all actions from the same state
are shifted by the same starting potential. The argmax remains where it was.

Arbitrary shaping changes the terrain. It can add a hill, a valley, or a
carousel. Once that happens, you are not accelerating the original problem. You
are solving a new one and hoping it rhymes.

That hope is not a theorem.

The gauge is.

---

## Sources

[^ng]: Andrew Y. Ng, Daishi Harada, and Stuart Russell, ["Policy Invariance Under Reward Transformations: Theory and Application to Reward Shaping"](https://people.eecs.berkeley.edu/~pabbeel/cs287-fa09/readings/NgHaradaRussell-shaping-ICML1999.pdf), ICML 1999.

[^randlov]: Jette Randlov and Preben Alstrom, ["Learning to Drive a Bicycle using Reinforcement Learning and Shaping"](https://gwern.net/doc/reinforcement-learning/model-free/1998-randlov.pdf), ICML 1998.

[^wiewiora]: Eric Wiewiora, Garrison Cottrell, and Charles Elkan, ["Principled Methods for Advising Reinforcement Learning Agents"](https://cseweb.ucsd.edu/~ewiewior/03principled.pdf), ICML 2003. See also Sutton and Barto's [Reinforcement Learning: An Introduction](https://mitpress.mit.edu/9780262039246/reinforcement-learning/) for the standard value-function and MDP framing.
