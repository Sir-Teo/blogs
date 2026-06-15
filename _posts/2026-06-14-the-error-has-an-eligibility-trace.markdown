---
layout: post
title: "Prediction Errors Leave Footprints"
description: "TD(lambda) gives the next surprise a trail to follow, so delayed reward can reach the states that made it likely."
date: 2026-06-14 14:10:00 -0400
categories: machine-learning
tags: [reinforcement-learning, temporal-difference-learning, eligibility-traces, credit-assignment, computational-neuroscience]
excerpt: "Eligibility traces are the memory behind TD(lambda): not a full transcript, just a fading list of who should hear the next prediction error."
---

The cheap complaint about delayed reward is that it arrives late.

The expensive complaint is that the agent has been making predictions the whole
time, and every one of those predictions left a receipt.

In a game, a trade, a recommender session, or a long debugging run, the final
outcome may arrive only once. But between the first decision and the last one,
the system keeps moving through states that are more or less promising. A bad
position becomes a worse position before it becomes a loss. A useful clue
appears before the ticket closes. A customer is gone before the churn label is
written.

Temporal-difference learning starts from that observation. Sutton's 1988
paper introduced a class of prediction methods that assign credit by comparing
successive predictions, not only by comparing an old prediction to the final
outcome.[^sutton1988] That sounds like a small bookkeeping change. It is not.
It turns "wait until the end" into "learn whenever your forecast has become
inconsistent with what happened next."

The extra piece, the one that makes the idea usable when the outcome is far
away, is a fading trail called an eligibility trace.

## The Ending Arrives Too Late

Consider a tiny random walk with terminal rewards. There are nonterminal states
1 through \(n\), a left terminal with reward 0, and a right terminal with reward
1. The value of a state is just the probability of eventually exiting on the
right:

$$
V(s) = \Pr(\text{right terminal} \mid S_t=s).
$$

Monte Carlo learning waits for the episode to end. If the walk eventually exits
right, every visited state is nudged toward 1; if it exits left, every visited
state is nudged toward 0. This is honest, but it has a blunt temporal
instrument: every update waits for the terminal label.

TD(0) asks for a smaller consistency condition. If \(S_t\) moves to
\(S_{t+1}\), the one-step temporal-difference error is

$$
\delta_t
=
R_{t+1} + \gamma V(S_{t+1}) - V(S_t).
$$

If the successor state looks better than the current state thought it should,
then the current state's prediction was too low. If the successor state looks
worse, it was too high. The reward may still be many steps away, but the
prediction has already learned something about itself.

This is why TD learning became more than a reinforcement-learning trick.
Tesauro's TD-Gammon used temporal differences and self-play to train a
backgammon evaluator from delayed game outcomes.[^tesauro] Schultz, Dayan, and
Montague later connected reward prediction errors to dopaminergic activity in
primate experiments, giving the same mathematical object a foothold in
computational neuroscience.[^schultz]

The mechanism is not "reward good, update everything." It is sharper:

```text
the next prediction disagreed with the previous prediction
```

That disagreement is enough to learn.

## The Memory TD(0) Throws Away

TD(0) updates only the state that just made the transition:

$$
V(S_t) \leftarrow V(S_t) + \alpha \delta_t.
$$

But the current prediction error did not appear out of nowhere. Earlier states
helped prepare it. If a reward finally arrives, the last state should get a
large update, the previous state should get some update, and a state seen long
ago should get less unless it kept coming back. The algorithm needs memory, but
not a transcript of the whole episode.

An eligibility trace is that memory:

$$
e_t(s)
=
\gamma\lambda e_{t-1}(s) + \mathbf{1}\{S_t=s\}.
$$

Then every state is updated by the same TD error, scaled by its trace:

$$
V(s)
\leftarrow
V(s) + \alpha \delta_t e_t(s).
$$

The parameter \(\lambda\) is a credit-assignment half-life. With \(\gamma=1\),
the trace falls by half after

$$
h(\lambda) = \frac{\log(1/2)}{\log(\lambda)}
$$

steps. At \(\lambda=0\), the trace dies immediately and TD(lambda) becomes
TD(0). At \(\lambda\) near 1, old states keep receiving credit and the method
becomes closer to Monte Carlo learning, though still online in the backward
view. The standard forward-view story says TD(lambda) averages \(n\)-step
returns with geometrically decaying weights; the backward view implements that
idea with traces rather than waiting for all the future returns to be known.
Sutton and Barto's eligibility-trace chapter is still the cleanest place to
see those views side by side.[^suttonbarto]

There is one practical wrinkle, and it matters more than the tidy equation
suggests. With **accumulating traces**, each revisit adds 1 to the trace. In a
loopy task, a frequently revisited state can become very eligible. With
**replacing traces**, a revisit sets the trace to 1 instead. Replacing traces
are not just cosmetic; in the 19-state random-walk example they tend to behave
well across a broader range of parameters.[^replacing]

## Let the Random Walk Talk Back

The lab below trains tabular predictors on the 19-state random walk. The true
value function is known, so the chart can report root-mean-square value error
rather than asking us to judge the curves by eye.

<div class="td-lambda-lab" data-td-lambda-lab>
  <div class="td-lambda-lab__controls">
    <label>
      States: <output data-value="states">19</output>
      <input type="range" min="5" max="25" step="2" value="19" data-param="states">
    </label>
    <label>
      Right step probability: <output data-value="rightProb">50%</output>
      <input type="range" min="35" max="65" step="1" value="50" data-param="rightProb">
    </label>
    <label>
      Step size alpha: <output data-value="alpha">4%</output>
      <input type="range" min="2" max="45" step="1" value="4" data-param="alpha">
    </label>
    <label>
      Lambda: <output data-value="lambda">40%</output>
      <input type="range" min="0" max="100" step="5" value="40" data-param="lambda">
    </label>
    <label>
      Episodes per run: <output data-value="episodes">60</output>
      <input type="range" min="5" max="160" step="5" value="60" data-param="episodes">
    </label>
    <label>
      Averaged runs: <output data-value="runs">80</output>
      <input type="range" min="20" max="160" step="10" value="80" data-param="runs">
    </label>
    <label>
      Trace rule
      <select data-param="traceMode">
        <option value="replace" selected>Replacing traces</option>
        <option value="accumulate">Accumulating traces</option>
      </select>
    </label>
  </div>
  <div class="td-lambda-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="TD lambda random walk lab showing value estimates, learning curves, lambda sweep, and eligibility traces"></canvas>
  <div class="td-lambda-lab__legend">
    <span><i style="background:#172026"></i> True value</span>
    <span><i style="background:#64748b"></i> TD(0)</span>
    <span><i style="background:#0f766e"></i> TD(lambda)</span>
    <span><i style="background:#be123c"></i> Monte Carlo</span>
    <span><i style="background:#2563eb"></i> Lambda sweep</span>
    <span><i style="background:#7c3aed"></i> Trace mass</span>
  </div>
  <p class="td-lambda-lab__note">
    Deterministic simulation. Each render reuses the same seeded episodes for
    TD(0), TD(lambda), and Monte Carlo within a run, then averages the value
    error across runs. The lambda sweep retrains from scratch at each grid
    value.
  </p>
</div>
<script defer src="{{ '/assets/js/td-lambda-lab.js?v=20260614a' | relative_url }}"></script>

In the default seed, \(\lambda=0.4\) is not a moral preference. It is what this
little world happens to reward. The final RMS error is about 0.165 for TD(0.4),
compared with about 0.184 for TD(0) and 0.192 for Monte Carlo. The lambda sweep
has a small valley around 0.4 to 0.5. That is the useful shape: a little memory
helps, too much memory starts to inject variance and repeated-visit
amplification.

The eligibility panel is the most literal picture. It freezes one episode at
the terminal reward and asks which states are still eligible for that reward's
prediction error. With low lambda, only the last few states hear it. With high
lambda, the error travels much farther backward.

Now make the experiment misbehave. Raise the step size, raise lambda, and
switch from replacing to accumulating traces. The value estimates can overshoot
and the lambda sweep will punish the far right of the chart. That is not a
bug. It is the reason traces are not just "more credit assignment." They are a
feedback gain.

Finally bias the walk to the right. The true value curve is no longer a
straight line. TD is not learning a label attached to a state; it is learning
the absorption probability implied by the transition process.

The source is short enough to audit:
[`assets/js/td-lambda-lab.js`]({{ '/assets/js/td-lambda-lab.js' | relative_url }}).

## Two Ways to Misread the Trick

There are two ways to misunderstand TD(lambda).

The first is to think of it as a hack for sparse rewards. It is more precise
than that. It is a way to turn a stream of changing forecasts into supervised
targets produced by the process itself. No final reward is needed for a TD
error to exist; the next state's value estimate is already a target.

The second is to think of lambda as a vague smoothness knob. Lambda is a memory
policy. It answers: when a prediction error appears, how far back should its
authority extend? That question shows up everywhere: long-horizon credit
assignment, user-session modeling, online evaluation, multi-step forecasting,
and any learning system where the label arrives after the causal evidence.

The trace update also explains why credit assignment is delicate. A trace is
stateful. It remembers the path, not just the current observation. It can
therefore accelerate learning when the path is informative, and destabilize
learning when the path revisits the same features too aggressively.

## The Honesty of a Tabular Toy

The lab is tabular. That is intentional. Every state has its own value entry,
the true values are computable, and the failure modes are visible.

With function approximation, traces become feature traces or parameter-space
traces. The beautiful equivalence between a forward view and a backward view
becomes more complicated once estimates change during the episode. Van Seijen
and Sutton's true online TD(lambda) paper is a good example of how much
subtlety is hiding under the classical update: it introduces a variant that
exactly matches an online forward view while keeping the same computational
order as conventional TD(lambda).[^trueonline]

Control adds another layer. Sarsa(lambda), Watkins's Q(lambda), and related
methods attach traces to state-action pairs and must decide what to do when
behavior is exploratory or off-policy. Prediction is the clean room; control
inherits the idea and brings in more dust.

## Half-Lives Should Probably Be Learned

The old random walk still feels productive because it isolates a question that
modern systems often blur:

```text
What is the right half-life for credit?
```

Fixed lambda says the half-life is the same everywhere. That is almost never
true. Some states are transient hints. Some are durable commitments. Some
features should be eligible only until contradicted; others should remain
eligible across a long quiet interval. In a market, a stale quote and a regime
change should not have the same trace. In a game, a sacrifice and a blunder
should not decay on the same clock. In an AI assistant, an early user
constraint and an incidental local wording choice should not share one memory
policy.

So the research direction is not "use TD(lambda) on everything." It is:
learn credit half-lives as part of the representation. Let the model decide
which evidence should keep receiving prediction-error updates, and which
evidence should fade quickly.

TD(lambda) is the small, old version of that idea. The error has a memory. The
interesting question is who gets to be remembered.

[^sutton1988]: Richard S. Sutton, ["Learning to Predict by the Methods of Temporal Differences"](https://link.springer.com/article/10.1007/BF00115009), *Machine Learning*, 1988. Sutton's abstract frames TD methods as assigning credit through differences between temporally successive predictions.

[^tesauro]: Gerald Tesauro, ["Temporal Difference Learning and TD-Gammon"](https://www.bkgm.com/articles/tesauro/tdl.html), *Communications of the ACM*, 1995.

[^schultz]: Wolfram Schultz, Peter Dayan, and P. Read Montague, ["A Neural Substrate of Prediction and Reward"](https://pubmed.ncbi.nlm.nih.gov/9054347/), *Science*, 1997.

[^suttonbarto]: Richard S. Sutton and Andrew G. Barto, [*Reinforcement Learning: An Introduction*, second edition](https://incompleteideas.net/book/the-book-2nd.html), especially the eligibility-trace treatment of forward and backward views.

[^replacing]: Sutton and Barto's older [Chapter 7 eligibility-trace slides](https://www-anw.cs.umass.edu/~barto/courses/cs687/Chapter%207.pdf) use the same 19-state random walk and note why replacing traces often behave better than accumulating traces in this setting.

[^trueonline]: Harm van Seijen and Richard S. Sutton, ["True Online TD(lambda)"](https://proceedings.mlr.press/v32/seijen14.html), *ICML*, 2014.
