---
layout: post
title: "Trees Spend Experiments"
description: "Monte Carlo Tree Search is not just lookahead. It is an adaptive sampling rule: spend simulations where uncertainty and upside are still worth paying for."
date: 2026-06-14 02:11:00 -0400
categories: ai-systems
tags: [monte-carlo-tree-search, bandits, reinforcement-learning, game-ai, alphago, planning]
excerpt: "MCTS turns game-tree search into a budget problem. The confidence bonus is the engine: it decides which branch deserves another experiment."
---

The phrase "tree search" makes the algorithm sound like it is carrying a lamp.

Start at the root. Walk into the tree. Look deeper. Come back with the best
move.

That image is not wrong, but it hides the most interesting part. Monte Carlo
Tree Search is not primarily a way to visit a tree. It is a way to allocate
experiments.

At every node the algorithm asks a small statistical question:

```text
which child is still worth sampling?
```

One child has a good empirical value. Another has barely been tried. A third has
an impressive prior from a policy network. A fourth looks bad, but maybe only
because the rollouts were noisy. Search budget is finite. Each simulation is a
measurement that could have been spent somewhere else.

The tree is a lab notebook.

## Every Node Runs a Tiny Experiment

The classical multi-armed bandit problem is brutally small. There are \(K\)
arms. Pull an arm, receive a noisy reward, update your estimate, and decide what
to pull next. A policy that only exploits the current best arm can get stuck. A
policy that explores forever wastes samples.

UCB1, analyzed by Auer, Cesa-Bianchi, and Fischer, chooses arms by adding an
uncertainty bonus to the empirical mean:[^ucb]

$$
\bar X_i + \sqrt{\frac{2\log n}{n_i}}.
$$

The first term says "this arm has paid well." The second says "this arm has not
been measured enough." The bonus shrinks as \(n_i\) grows and rises slowly as
the total experiment count \(n\) grows. That is the shape of optimism under
uncertainty: act as if the poorly measured arm may still be good, but make it
earn that optimism with evidence.

Kocsis and Szepesvari's UCT algorithm put this bandit rule inside Monte Carlo
planning.[^uct] At a tree node \(s\), choose action \(a\) by something like

$$
Q(s,a) + c \sqrt{\frac{\log N(s)}{N(s,a)}}.
$$

Now every internal node has its own little bandit problem. The root allocates
visits across candidate moves. A child node allocates visits across replies.
Deeper nodes allocate visits across continuations. The algorithm grows an
irregular tree, not because irregularity is elegant, but because equal search is
usually a bad experiment design.

If a branch is obviously poor, stop measuring it. If a branch is promising and
uncertain, measure it again. If a branch is promising and already well measured,
exploit it but do not pretend uncertainty is gone.

That is the core move. MCTS is tree search with an accounting system for doubt.

## Rollouts Are Measurements, Not Oracles

Early Monte Carlo game programs could estimate a position by averaging many
random continuations. That sounds reckless until you remember the alternative:
in enormous games, a handcrafted evaluation function may also be reckless, just
with more confidence.

Rémi Coulom's work on Monte Carlo tree search emphasized that averaging and
tree growth need not be separate phases.[^coulom] A program can use simulated
playouts to estimate positions while also deciding which parts of the tree
deserve finer resolution. The Browne et al. survey describes MCTS as combining
the generality of random sampling with the precision of tree search, and tracks
how quickly the method spread from Go into other planning domains.[^survey]

The catch is that a rollout is a measurement produced by a policy. If the
rollout policy is bad, the measurement is biased. If the reward is high
variance, the measurement is noisy. If the opponent has one precise refutation,
uniform random play may miss it too often. The confidence bound does not make
bad measurements good. It decides where more measurements are worth buying.

This is one reason the AlphaGo lineage is so clarifying. The 2016 AlphaGo system
combined policy networks, value networks, Monte Carlo simulation, and tree
search.[^alphago] AlphaGo Zero went further: it trained from self-play without
human games, and the neural network improved the tree search while the tree
search improved the training targets.[^alphago-zero] The neural network did not
make search disappear. It made search more selective.

Rosin's predictor-guided bandit work gives the statistical version of the same
intuition: contextual information can bias an episode toward promising arms, but
because the predictor can be wrong, it still has to be combined with exploration
inside the episode.[^rosin]

That sentence is the whole modern compromise:

```text
use the prior
but keep the right to doubt it
```

## A Toy Tree With Bad Temptations

The lab below runs a deterministic toy MCTS experiment in the browser. It is not
a full game engine. It is a small adversarial tree built to expose the allocation
problem.

There are three scenarios:

1. **Refutation trap:** a flashy move looks good if the opponent misses the only
   reply, but a minimizing opponent can find the refutation.
2. **Variance race:** three moves have close values, but different rollout
   noise.
3. **Policy prior bait:** a policy prior likes a popular move that is not
   actually best.

UCT uses the empirical value plus an exploration bonus. PUCT adds a prior term
that spends more early budget on moves favored by a policy. The visualization
shows visit allocation, estimated values \(Q\), true toy-tree values, and the
simple regret of the move that would be played by visit count.

<style>
  .mcts-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .mcts-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(166px, 1fr));
  }

  .mcts-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .mcts-lab__controls input,
  .mcts-lab__controls select {
    accent-color: #2563eb;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    width: 100%;
  }

  .mcts-lab__controls input[type="range"] {
    border: 0;
  }

  .mcts-lab__controls select {
    min-height: 2rem;
    padding: 0.25rem 0.4rem;
  }

  .mcts-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .mcts-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .mcts-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .mcts-lab__metric span,
  .mcts-lab__legend,
  .mcts-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .mcts-lab__metric span {
    display: block;
  }

  .mcts-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .mcts-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .mcts-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .mcts-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .mcts-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .mcts-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="mcts-lab" data-mcts-confidence-lab>
  <div class="mcts-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="trap">Refutation trap</option>
        <option value="variance">Variance race</option>
        <option value="prior">Policy prior bait</option>
      </select>
    </label>
    <label>
      Selection rule
      <select data-param="selector">
        <option value="uct">UCT</option>
        <option value="puct">PUCT</option>
      </select>
    </label>
    <label>
      Simulations: <output data-value="simulations">260</output>
      <input type="range" min="24" max="900" step="4" value="260" data-param="simulations">
    </label>
    <label>
      UCT exploration: <output data-value="exploration">1.10</output>
      <input type="range" min="0" max="250" step="5" value="110" data-param="exploration">
    </label>
    <label>
      PUCT prior strength: <output data-value="prior">1.20</output>
      <input type="range" min="0" max="320" step="5" value="120" data-param="prior">
    </label>
    <label>
      Rollout noise: <output data-value="noise">0.18</output>
      <input type="range" min="0" max="60" step="1" value="18" data-param="noise">
    </label>
    <label>
      Seed: <output data-value="seed">7</output>
      <input type="range" min="1" max="99" step="1" value="7" data-param="seed">
    </label>
  </div>
  <div class="mcts-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Monte Carlo Tree Search toy simulator showing tree visits, root allocation, value estimates, and regret"></canvas>
  <div class="mcts-lab__legend">
    <span><i style="background:#0f766e"></i> Max node</span>
    <span><i style="background:#be123c"></i> Min node</span>
    <span><i style="background:#2563eb"></i> Visit flow</span>
    <span><i style="background:#7c3aed"></i> Estimated Q</span>
    <span><i style="background:#b45309"></i> True toy value</span>
  </div>
  <p class="mcts-lab__note">
    Deterministic toy experiment. Rewards are sampled from clipped normal leaf
    distributions using the seed above. "True" values are the toy tree's leaf
    means with minimizing replies at opponent nodes. The recommended move is
    the root child with the most visits, matching the usual robust-child choice.
  </p>
</div>
<script defer src="{{ '/assets/js/mcts-confidence-lab.js?v=20260614a' | relative_url }}"></script>

In the default refutation-trap run, UCT spends 172 of 260 visits on **Solid
squeeze**, identifies it as the true best move, and ends with zero simple
regret. In a policy-prior-bait run with PUCT prior strength raised to `3.00`,
the search spends 138 visits on **Popular move** and recommends it even though
**Ugly resource** has the better true value; the regret is `0.17`. I swept 1,458
scenario/selector/budget/noise/seed combinations, and every run preserved visit
accounting and finite regret.

Try the failure modes.

Switch to **Policy prior bait**, select **PUCT**, and raise prior strength. The
search spends more of its early budget on the popular move. If the prior is
wrong and the budget is not large enough, the recommended move can be wrong.
That is not a contradiction of policy-guided search. It is the point: a prior is
a budget allocation hint, not a proof.

Switch back to **Refutation trap**. The flashy attack has a high upside if the
opponent misses. But under a minimizing reply node, the search must keep paying
for the uncomfortable reply. The tree does not need to visit every continuation
equally. It needs enough evidence that the refutation is real.

Now raise **Rollout noise** in **Variance race**. The empirical \(Q\) markers
shake away from the true-value markers, and the exploration constant matters
more. Low exploration becomes a fragile declaration that early luck was truth.
High exploration spends more budget checking alternatives.

This is the practical personality of MCTS. It is opportunistic, but not purely
greedy. It believes its measurements, but only in proportion to how many it has
bought.

## The Policy Prior Moves the Budget

AlphaGo-style systems changed two measurements in the loop.

First, a policy network supplies a prior over actions. In PUCT-like rules, that
prior appears as an exploration term: moves the policy likes receive more early
attention. This is useful when the action space is huge. It is dangerous when
the policy is confidently wrong.

Second, a value network can replace or supplement long rollouts. Instead of
playing random or semi-random continuations to the end, the search can ask a
learned evaluator for the value of a leaf position. This reduces rollout noise
and depth, but it introduces model error. The search is now allocating queries
to a learned judge.

The AlphaGo Zero loop made this circular on purpose. Search produced improved
move targets. Self-play produced outcomes. The neural network learned to predict
both. Then the improved network guided the next search. The search was not just
an inference procedure at play time; it was also a data generator for training.

That is why "the model plus search" is the wrong decomposition. In these
systems, search is part of the model's behavior, and the model is part of the
search policy.

## Every Partial Tree Is a Useful Lie

Every partial search tree is a lie. It says the explored continuations are
important and the unexplored continuations are less important. The question is
whether the lie is useful under the budget.

Uniform search tells a very tidy lie. It says all branches at a depth deserve
the same attention. Greedy search tells a dangerous lie. It says early estimates
are reliable enough to stop asking. MCTS tells a more interesting lie:

```text
look where value and uncertainty still overlap
```

That is why the confidence term matters so much. It is not a tuning nuisance
around the algorithm. It is the mechanism that decides which uncertainty is
operationally alive.

The lesson transfers beyond games. Any agent that samples plans, tool calls,
proof steps, code patches, or reasoning traces is running some version of this
experiment. It has a prior. It has noisy evaluations. It has a budget. It has a
stopping rule. It can overexploit an early lucky branch or waste budget
wandering forever.

Calling that "thinking longer" is too vague.

The sharper question is:

```text
what uncertainty is the extra compute buying down?
```

MCTS has a beautiful answer because it writes the answer into the tree. Every
edge records how much doubt was worth paying for.

## Further Reading

[^ucb]: Peter Auer, Nicolo Cesa-Bianchi, and Paul Fischer, "Finite-time Analysis of the Multiarmed Bandit Problem," *Machine Learning* 47, 235-256, 2002. [Springer](https://link.springer.com/article/10.1023/A%3A1013689704352), [PDF](https://homes.di.unimi.it/~cesabian/Pubblicazioni/ml-02.pdf).

[^uct]: Levente Kocsis and Csaba Szepesvari, "Bandit Based Monte-Carlo Planning," ECML 2006. [Springer](https://link.springer.com/chapter/10.1007/11871842_29), [PDF](https://ggp.stanford.edu/readings/uct.pdf).

[^coulom]: Remi Coulom, "Efficient Selectivity and Backup Operators in Monte-Carlo Tree Search," Computers and Games 2006. [Author page](https://www.remi-coulom.fr/CG2006/), [PDF](https://inria.hal.science/inria-00116992/document).

[^survey]: Cameron B. Browne, Edward Powley, Daniel Whitehouse, Simon M. Lucas, Peter I. Cowling, Philipp Rohlfshagen, Stephen Tavener, Diego Perez, Spyridon Samothrakis, and Simon Colton, "A Survey of Monte Carlo Tree Search Methods," *IEEE Transactions on Computational Intelligence and AI in Games* 4(1), 1-43, 2012. [York Research Database](https://pure.york.ac.uk/portal/en/publications/a-survey-of-monte-carlo-tree-search-methods/), [PDF](https://www.incompleteideas.net/609%20dropbox/other%20readings%20and%20resources/MCTS-survey.pdf).

[^alphago]: David Silver, Aja Huang, Chris J. Maddison, Arthur Guez, Laurent Sifre, George van den Driessche, Julian Schrittwieser, Ioannis Antonoglou, Veda Panneershelvam, Marc Lanctot, and others, "Mastering the game of Go with deep neural networks and tree search," *Nature* 529, 484-489, 2016. [Nature](https://www.nature.com/articles/nature16961).

[^alphago-zero]: David Silver, Julian Schrittwieser, Karen Simonyan, Ioannis Antonoglou, Aja Huang, Arthur Guez, Thomas Hubert, Lucas Baker, Matthew Lai, Adrian Bolton, and others, "Mastering the game of Go without human knowledge," *Nature* 550, 354-359, 2017. [Nature](https://www.nature.com/articles/nature24270).

[^rosin]: Christopher D. Rosin, "Multi-armed Bandits with Episode Context," *Annals of Mathematics and Artificial Intelligence* 61, 203-230, 2011. [Springer](https://link.springer.com/article/10.1007/s10472-011-9258-6), [PDF](https://chrisrosin.com/isaim2010final.pdf).
