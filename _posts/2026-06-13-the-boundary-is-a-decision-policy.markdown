---
layout: post
title: "Button Presses Carry Clocks"
description: "A drift-diffusion model treats a decision as noisy evidence accumulating until it crosses a threshold. The boundary prices time, mistakes, and uncertainty."
date: 2026-06-13 18:00:00 -0400
categories: psychology
tags: [drift-diffusion-model, decision-making, reaction-time, sequential-analysis, cognitive-science, statistics]
excerpt: "A two-choice decision is not only which button was pressed. It is how long the system waited before pressing it."
---

A classifier returns a label. A person returns a label and a latency.

That extra number is not administrative dust. Reaction time is a measurement of
the computation. It says how much evidence the system needed, how noisy the
world felt, how cautious the person was, and sometimes which mistake was already
waiting in the hand.

The drift-diffusion model is one of the cleanest little bridges between
psychology and statistics. It says:

```text
evidence arrives noisily
the decision variable accumulates it
a choice is made when the variable hits a boundary
```

The model is not a metaphor for indecision. It is a stochastic process with a
stopping rule. That is why it keeps reappearing in memory, perception,
neuroscience, psychometrics, human-computer interaction, and sequential testing.
It gives choice and time the same explanation.

## A Choice Has a Stopwatch Inside

For a two-alternative task, write the latent evidence as $$X_t$$. Positive values
favor the upper response. Negative values favor the lower response. The simplest
continuous-time model is:

$$
dX_t = v\,dt + \sigma\,dW_t.
$$

Here $$v$$ is the drift rate, $$\sigma$$ is the noise scale, and $$W_t$$ is
Brownian motion. The process starts at $$X_0=z$$ and stops at:

$$
\tau
=
\inf\{t: X_t \ge a \text{ or } X_t \le -a\}.
$$

If $$X_\tau = a$$, the upper response is chosen. If $$X_\tau=-a$$, the lower
response is chosen. The observed reaction time is usually modeled as:

$$
\mathrm{RT} = \tau + t_0,
$$

where $$t_0$$ is nondecision time: encoding, motor execution, display latency,
and other time not spent accumulating evidence.

Each parameter has a behavioral interpretation:

- drift rate $$v$$: quality and direction of evidence;
- boundary height $$a$$: caution or required certainty;
- start point $$z$$: prior bias toward one response;
- noise $$\sigma$$: internal or stimulus uncertainty;
- nondecision time $$t_0$$: everything around the decision, not inside it.

Ratcliff's 1978 model of memory retrieval used this diffusion machinery to
explain not only accuracy but also the shape of reaction-time distributions.[^ratcliff-1978]
Ratcliff and McKoon's review is still a good entry point because it keeps the
core promise visible: a serious model of two-choice behavior must explain the
joint distribution of choices and response times, not merely percent correct.[^ratcliff-mckoon]

## A Race You Can Slow Down

The lab below simulates a positive-drift task where the upper boundary is the
correct response. The paths panel shows individual evidence trajectories. The
histogram shows reaction times by outcome. The sweep changes only the boundary,
so you can see how caution alters accuracy, speed, and reward rate.

Try three moves:

1. raise **Boundary height** and watch decisions slow down while accuracy
   improves;
2. lower **Evidence drift** and notice that no threshold setting can fully save
   a weak signal;
3. push **Start bias** negative and see fast errors appear before the evidence
   has had a fair hearing.

<div id="ddm-lab" class="ddm-lab" data-ddm-lab>
  <div class="ddm-lab__controls">
    <label>
      Evidence drift: <output data-value="drift">0.70</output>
      <input type="range" min="0.05" max="1.60" step="0.05" value="0.70" data-param="drift">
    </label>
    <label>
      Boundary height: <output data-value="boundary">1.15</output>
      <input type="range" min="0.40" max="2.40" step="0.05" value="1.15" data-param="boundary">
    </label>
    <label>
      Noise scale: <output data-value="noise">1.00</output>
      <input type="range" min="0.35" max="1.80" step="0.05" value="1.00" data-param="noise">
    </label>
    <label>
      Start bias: <output data-value="startBias">0.000%</output>
      <input type="range" min="-60" max="60" step="5" value="0" data-param="startBias">
    </label>
    <label>
      Nondecision time: <output data-value="nondecision">300 ms</output>
      <input type="range" min="150" max="650" step="25" value="300" data-param="nondecision">
    </label>
    <label>
      Error cost: <output data-value="errorCost">1.00</output>
      <input type="range" min="0" max="3" step="0.25" value="1" data-param="errorCost">
    </label>
    <label>
      Simulated trials: <output data-value="trials">420</output>
      <input type="range" min="120" max="1000" step="40" value="420" data-param="trials">
    </label>
  </div>
  <div class="ddm-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Drift diffusion simulator showing evidence paths, reaction time histograms, boundary sweep, and a decision ledger"></canvas>
  <div class="ddm-lab__legend">
    <span><i style="background:#0f766e"></i> Correct</span>
    <span><i style="background:#be123c"></i> Error</span>
    <span><i style="background:#64748b"></i> Timeout</span>
    <span><i style="background:#d97706"></i> Start / current</span>
    <span><i style="background:#2563eb"></i> Reward rate</span>
    <span><i style="background:#7c3aed"></i> Best boundary</span>
  </div>
  <p class="ddm-lab__note">
    Deterministic synthetic experiment. Evidence evolves by
    dX_t = v dt + sigma dW_t with fixed symmetric boundaries. Reward rate uses
    correct choices minus error-cost-weighted mistakes, divided by reaction time
    plus a 250 ms inter-trial interval. The sweep reuses the same parameter
    values while changing only the boundary height.
  </p>
</div>
<script defer src="{{ '/assets/js/ddm-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the lower boundary is not crossed often because drift is
positive. The errors that remain are mostly noise paths that wandered downward
early. Raise the boundary and you give those paths more time to recover, but you
also make every ordinary correct decision wait longer.

This is the central trade:

```text
low boundary: quick, confident-looking, mistake-prone
high boundary: accurate, patient, expensive in time
```

The word "threshold" is sometimes used as if it were a mere implementation
detail. In this model the boundary is the policy. It encodes how much delay is
worth buying for a marginal reduction in mistakes.

## Speed-Accuracy Has Prices

The speed-accuracy tradeoff is often described qualitatively: be careful and you
get slower; hurry and you get noisier. The diffusion model makes it quantitative.

With positive drift and symmetric boundaries, increasing $$a$$ usually increases
accuracy because a random walk with upward drift has more room to reveal its
direction before it is forced into a response. But the mean decision time rises
because the process must travel farther before stopping.

The right boundary depends on the task environment. If errors are cheap and new
trials arrive quickly, a lower boundary can maximize reward per unit time. If
errors are costly, irreversible, or embarrassing, caution earns its keep.

Bogacz, Brown, Moehlis, Holmes, and Cohen analyzed two-alternative forced-choice
tasks from this optimal-decision perspective, connecting diffusion-style models
to reward-rate maximization and classical sequential decision rules.[^bogacz]
That framing is useful because it changes the question from:

```text
what threshold seems reasonable?
```

to:

```text
what boundary is optimal under this payoff schedule and time budget?
```

This is why the lab's best boundary moves when you raise **Error cost**. The
same psychophysical stimulus can justify different caution policies in a game, a
medical screen, a fraud system, or a trading strategy.

## The Prior Starts Moving Before Evidence

The start point $$z$$ is the part of the model that feels psychological because
it turns a prior into a physical head start.

If a participant expects the upper response, evidence can start closer to the
upper boundary. This increases the probability of an upper choice and often
speeds that choice. If the prior is wrong, it creates fast errors: the system is
not merely biased at the final comparison; it begins the race already leaning.

This is one reason reaction times are diagnostic. Two datasets can have similar
accuracy and different mechanisms:

- stronger drift means the evidence itself improved;
- lower boundary means the observer became less cautious;
- positive start bias means the observer expected one answer;
- lower nondecision time means the surrounding pipeline got faster.

Accuracy alone confounds these. Reaction-time distributions help separate them.
The separation is not automatic, and real fits need care, but the goal is
exactly right: infer the latent computation from both what was chosen and when.

## The Delay Around the Decision

Nondecision time $$t_0$$ is easy to dismiss because it is not the glamorous part
of the model. That is a mistake.

A person may see the stimulus slowly, map evidence to keys awkwardly, or press a
button through a laggy device. A machine may have feature extraction, queueing,
network, or logging delay around its classifier. Those delays stretch reaction
times without changing evidence quality.

If you ignore $$t_0$$, you may explain peripheral latency as cognitive caution.
If you overfit $$t_0$$, you may hide real decision-time changes in a nuisance
parameter. The small symbol is doing real hygiene work.

The same warning applies in machine-learning systems. End-to-end latency is not
the same as model uncertainty. A retry, cache miss, tool call, or moderation pass
can look like "harder reasoning" unless the pipeline decomposes time.

## A Sequential Test With Fingers

The diffusion model also has a statistical cousin: sequential hypothesis
testing. A system observes evidence over time and stops when the log-likelihood
ratio is large enough to choose one hypothesis over another. Wald's sequential
probability ratio test formalized this stop-when-evidence-is-sufficient logic in
statistics.[^wald]

The diffusion model is not identical to every sequential probability ratio
test, but the family resemblance matters. Both replace fixed-sample thinking
with a stopping rule. The sample size is not chosen in advance; it is a random
variable produced by the evidence path.

This is a healthier way to read a reaction time:

```text
not "how slow was the subject?"
but "how much evidence did this stopping policy require on this trial?"
```

Gold and Shadlen's review traces the neuroscience version of the same idea:
perceptual decisions can be described as evidence accumulation toward a bound,
with neural activity in sensorimotor circuits reflecting the evolving decision
variable.[^gold-shadlen] The exact neural implementation is richer than the toy
model, but the computational grammar is recognizable.

## The Toy Is Cleaner Than the Data

The toy lab is honest about the mechanism and dishonest about the mess.

Real data bring across-trial variation in drift, starting point, and nondecision
time. Some responses are contaminant lapses. Boundaries may collapse with time.
Participants may learn, fatigue, switch strategies, or trade speed for accuracy
within a block. Multi-alternative choices are not just two-boundary diffusion
with extra labels.

There is also a practical identifiability problem. A change in observed reaction
times can be explained by several parameter combinations. Better stimuli can
raise drift. Different instructions can lower boundaries. A response-mapping
change can alter nondecision time. A base-rate cue can move start point.

So the model should not be used as a storytelling machine:

```text
fit parameters
choose the most narratively pleasing one
publish the adjective
```

It should be used as a constrained generative model. Fit it, simulate from it,
check whether it reproduces accuracy, conditional reaction-time quantiles,
errors, correct responses, and the effect of task manipulations. If the posterior
predictive checks fail, the parameters are not yet explanations.

## Evidence-Accumulation Checklist

Before I believe a diffusion-model claim, I want to know:

- whether the model predicts both choices and reaction-time distributions;
- how outlier fast responses and long lapses were handled;
- whether nondecision time is identifiable from the design;
- whether drift, boundary, and starting point were manipulated independently;
- whether hierarchical pooling was used when individual subjects are sparse;
- whether the same parameters predict held-out conditions;
- whether the payoff structure justifies the claimed optimal boundary;
- whether conclusions survive plausible contaminant processes;
- whether the task is truly two-alternative or only forced into that shape;
- whether posterior predictive checks are shown, not merely parameter tables.

The diffusion model earns its place because it refuses to throw away time. A
response is not just a class label. It is a path that stopped.

That is a useful lesson far outside psychology. Any system that waits for more
evidence has a boundary somewhere: an abstention rule, a retry budget, a human
review trigger, a stop-loss, a diagnostic threshold, a beam-search termination
rule, a confidence gate. The question is not whether there is a threshold. The
question is what cost function taught it to stand there.

## Source Notes

[^ratcliff-1978]: Roger Ratcliff, ["A theory of memory retrieval"](https://doi.org/10.1037/0033-295X.85.2.59), *Psychological Review*, 1978.

[^ratcliff-mckoon]: Roger Ratcliff and Gail McKoon, ["The Diffusion Decision Model: Theory and Data for Two-Choice Decision Tasks"](https://doi.org/10.1162/neco.2008.12-06-420), *Neural Computation*, 2008. An open full-text copy is available through [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2474742/).

[^bogacz]: Rafal Bogacz, Eric Brown, Jeff Moehlis, Philip Holmes, and Jonathan D. Cohen, ["The physics of optimal decision making: A formal analysis of models of performance in two-alternative forced-choice tasks"](https://doi.org/10.1037/0033-295X.113.4.700), *Psychological Review*, 2006.

[^wald]: Abraham Wald, *Sequential Analysis*, John Wiley & Sons, 1947. For historical context, see Wald's earlier sequential-test paper in *The Annals of Mathematical Statistics*: ["Sequential Tests of Statistical Hypotheses"](https://projecteuclid.org/journals/annals-of-mathematical-statistics/volume-16/issue-2/Sequential-Tests-of-Statistical-Hypotheses/10.1214/aoms/1177731118.full), 1945.

[^gold-shadlen]: Joshua I. Gold and Michael N. Shadlen, ["The Neural Basis of Decision Making"](https://www.annualreviews.org/content/journals/10.1146/annurev.neuro.29.051605.113038), *Annual Review of Neuroscience*, 2007.
