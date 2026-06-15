---
layout: post
title: "Every Trial Spends the Budget"
description: "Bayesian optimization is not optimizer dust. It is a policy for choosing the next expensive experiment under uncertainty, and its failures belong in the decision log."
date: 2026-06-13 05:07:00 -0400
categories: machine-learning
tags: [bayesian-optimization, gaussian-processes, experiment-design, hyperparameter-optimization, active-learning]
excerpt: "Bayesian optimization is about the next costly trial: one more training run, experiment, backtest, simulation, or lab measurement that spends scarce budget."
---

Suppose you are allowed to ask a black box 20 questions.

The black box might be a model-training run, a robot calibration trial, a
chemistry experiment, a CPU-heavy simulator, a portfolio backtest with a long
validation pipeline, or an A/B experiment that consumes real users. Each answer
is noisy. Each answer costs time. You do not get to observe gradients. You do
not get to sweep a dense grid and call it science.

Bayesian optimization starts from that awkward constraint:

```text
the next evaluation has an opportunity cost
```

This sounds modest because it is. That modesty is the whole point. Bayesian
optimization is not a universal optimizer. It is a disciplined way to decide
what to measure next when measurement is expensive and your current map of the
world is incomplete.

The trick is to keep two ledgers at once:

1. What looks good according to the data already observed?
2. What remains uncertain enough that measuring it might change the decision?

The acquisition function is where those two ledgers meet.

## The Two-Ledger Loop

Write the unknown objective as

$$
y_i = f(x_i) + \epsilon_i,
$$

where $$x_i$$ is the configuration you tried and $$y_i$$ is the noisy result.
In a hyperparameter search, $$x_i$$ might encode learning rate, weight decay,
batch size, augmentation strength, and architecture knobs. In a lab experiment,
it might encode temperature, pressure, and concentration. In a trading system,
it might encode thresholds, holding periods, or execution parameters.

After $$t$$ observations, a surrogate model represents a belief over the
function. With a Gaussian process, the posterior says

$$
f \mid D_t \sim \mathcal{GP}(\mu_t, k_t).
$$

At a candidate point $$x$$, the surrogate gives a mean $$\mu_t(x)$$ and an
uncertainty $$\sigma_t(x)$$. Then an acquisition function scores candidates:

$$
x_{t+1}
=
\arg\max_x a_t(x).
$$

For maximization, expected improvement is the classic example. Let
$$f^+$$ be the best observed value, let $$\xi$$ be a small exploration offset,
and define

$$
z = \frac{\mu_t(x) - f^+ - \xi}{\sigma_t(x)}.
$$

Then

$$
\mathrm{EI}(x)
=
(\mu_t(x)-f^+-\xi)\Phi(z) + \sigma_t(x)\phi(z),
$$

where $$\Phi$$ and $$\phi$$ are the standard normal CDF and density. The first
term rewards locations whose posterior mean already beats the incumbent. The
second term rewards uncertainty. If $$\sigma_t(x)$$ is near zero, the point has
little option value. If $$\sigma_t(x)$$ is large, it can be worth sampling even
when the mean is not yet exciting.

That is the little economic idea hiding inside the math:

```text
uncertainty is valuable only when resolving it could change what you do
```

Expected improvement was central to the Efficient Global Optimization algorithm
of Jones, Schonlau, and Welch.[^ego] Gaussian processes provide the cleanest
textbook version of the surrogate machinery.[^gpml] Snoek, Larochelle, and
Adams helped make the approach feel practical for machine-learning
hyperparameter optimization, emphasizing that the evaluation cost is often the
dominant constraint.[^snoek]

But the loop has four moving parts, not one:

1. the expensive outer evaluation;
2. the surrogate model;
3. the acquisition function;
4. the cheap inner optimizer that maximizes the acquisition function.

Confusing these pieces leads to bad folklore. A Gaussian process is not
Bayesian optimization. Expected improvement is not Bayesian optimization. A
fancy acquisition function is not useful if the surrogate is wrong, the search
space is badly encoded, or the real cost is hidden in queues and failed runs.

## Search Policy Bench

The lab below is one-dimensional on purpose. Real Bayesian optimization is often
messy because the search space is high-dimensional, conditional, categorical,
constrained, and asynchronous. Here the space is small enough that you can see
the whole policy.

The simulator uses a squared-exponential Gaussian process surrogate. It begins
with three initial observations, then spends the remaining budget using one of
six policies:

1. **EI**: expected improvement.
2. **UCB**: posterior mean plus an uncertainty bonus.
3. **PI**: probability of improvement.
4. **Exploit**: sample where the posterior mean is highest.
5. **Random**: ignore the surrogate.
6. **Grid**: space samples as evenly as possible.

The true objective is drawn in gray. The GP posterior mean is green. The teal
band is uncertainty. Red points are samples chosen after the initial design.
The vertical dashed line marks the true optimum, which the policy does not get
to know.

<div class="bayesopt-lab" data-bayesopt-lab>
  <div class="bayesopt-lab__controls">
    <label>
      Objective
      <select data-param="objective">
        <option value="needle">Needle in haystack</option>
        <option value="rugged">Rugged landscape</option>
        <option value="smooth">Smooth hills</option>
      </select>
    </label>
    <label>
      Policy
      <select data-param="policy">
        <option value="ei">Expected improvement</option>
        <option value="ucb">Upper confidence bound</option>
        <option value="pi">Probability of improvement</option>
        <option value="exploit">Pure exploitation</option>
        <option value="random">Random search</option>
        <option value="grid">Space-filling grid</option>
      </select>
    </label>
    <label>
      Evaluations: <output data-value="budget">16</output>
      <input type="range" min="6" max="30" step="1" value="16" data-param="budget">
    </label>
    <label>
      Observation noise: <output data-value="noise">4%</output>
      <input type="range" min="0" max="20" step="1" value="4" data-param="noise">
    </label>
    <label>
      GP lengthscale: <output data-value="lengthscale">12%</output>
      <input type="range" min="4" max="35" step="1" value="12" data-param="lengthscale">
    </label>
    <label>
      Exploration: <output data-value="exploration">35%</output>
      <input type="range" min="0" max="100" step="5" value="35" data-param="exploration">
    </label>
  </div>
  <div class="bayesopt-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="620" aria-label="Bayesian optimization simulator showing posterior mean, uncertainty, acquisition score, and regret"></canvas>
  <div class="bayesopt-lab__legend">
    <span><i style="background:#64748b"></i> True objective</span>
    <span><i style="background:#0f766e"></i> GP mean</span>
    <span><i style="background:#99f6e4"></i> Uncertainty band</span>
    <span><i style="background:#be123c"></i> Chosen evaluations</span>
    <span><i style="background:#7c3aed"></i> Acquisition score</span>
  </div>
  <p class="bayesopt-lab__note">
    Deterministic toy experiment. The objective values are normalized after a
    hidden true grid is computed. The optimizer only sees noisy point samples,
    fits a Gaussian process, and chooses the next point from a fine candidate
    grid. Lower regret means the best sampled point is closer to the hidden
    optimum.
  </p>
</div>
<script src="{{ '/assets/js/bayesopt-lab.js?v=20260613a' | relative_url }}"></script>

Start with the default: needle in haystack, EI, 16 evaluations, 4 percent
noise. The first broad bump is tempting. The narrow peak near the right side is
the real prize. EI usually spends a few evaluations on the promising broad
region, but the uncertainty bonus keeps enough curiosity alive to find the
narrower optimum.

Now switch to pure exploitation. It often settles too early. The posterior mean
is a seductive liar because the model is most confident where it has already
looked. Exploitation is not irrational in a world where evaluation is cheap and
you can retry forever. It is irrational when each query spends part of a small
budget.

Switch to PI. Probability of improvement can be surprisingly myopic. A point
that barely beats the incumbent with high probability can dominate a point that
might beat it by a lot. In a noisy objective, this creates a policy that chases
thin improvements rather than high option value.

Now choose UCB and move the exploration slider. High exploration samples the
unknown. Low exploration behaves more like exploitation. The clean theoretical
GP-UCB story uses carefully chosen confidence parameters and assumptions about
the function class; the slider here is just an engineering knob. That
difference matters. Most deployed acquisition functions are not the theorem.
They are approximations that inherit the theorem's vocabulary.

Finally, try random search and grid search. They are not straw men. Bergstra and
Bengio's random-search argument remains one of the best practical warnings:
when only a few hyperparameters matter, random search can beat a grid because it
does not waste trials exhaustively varying irrelevant dimensions.[^random]
Bayesian optimization must beat these baselines after accounting for the extra
complexity of the surrogate and acquisition optimizer.

## What the Toy Refuses to Show

The toy is transparent because it is one-dimensional. That is also why it is
misleading.

In a real search space, distance is a modeling choice. A Gaussian-process kernel
over raw hyperparameters says which configurations should generalize to which
other configurations. If learning rate is on a log scale but the surrogate sees
it on a linear scale, the model is being lied to. If architecture choices are
categorical and conditional, a smooth Euclidean kernel may be nonsense. If
there are constraints, failed jobs, early-stopped trials, or variable runtimes,
the objective is no longer just $$f(x)$$.

Noise also changes the meaning of "best." With a noisy objective, the incumbent
can be a lucky observation. A policy that uses the best observed value without
accounting for observation noise may overreact. In production hyperparameter
search, this is everywhere: validation scores have seed variance, data-order
variance, hardware nondeterminism, and selection bias from repeated tries.

The search budget itself is usually structured. You may have:

```text
20 trials today
4 GPUs at a time
early metrics after 10 minutes
final metrics after 6 hours
some failed runs
some categorical choices
one hidden business metric that is checked last
```

That is not the clean scalar loop in the equation. It is a scheduling and
information-design problem.

This is why the best review papers talk less like optimizer advertisements and
more like experimental-design manuals.[^brochu] [^frazier] [^review] The
question is not "Which optimizer is best?" The question is:

```text
What can I learn before I have spent the budget?
```

## A Tiny Research Manager

Think of Bayesian optimization as a tiny research manager.

It asks: given the partial evidence, where should the next intern, GPU, wet-lab
plate, robot trial, or simulator job go? A good manager does not only chase the
currently best-looking project. A good manager also funds experiments that can
resolve uncertainty about promising but under-measured directions.

That framing makes the failure modes easier to see.

**Bad priors.** The surrogate smooths across points that should not be smoothed,
or fails to smooth across points that share structure.

**Bad measurements.** The objective is noisy, delayed, nonstationary, or a proxy
for the real objective.

**Bad accounting.** Evaluation costs differ, but the acquisition treats all
queries as equally expensive.

**Bad inner optimization.** The acquisition function has many local optima or
is optimized poorly, so the next "best" point is an artifact.

**Bad dimensionality.** The search space is too large for the budget, so the
posterior uncertainty is high almost everywhere.

**Bad baselines.** Random search, low-discrepancy search, or a human-designed
sweep would have found the same result with less machinery.

The last one is not a joke. If Bayesian optimization is a way to allocate
expensive measurements, its own overhead belongs in the ledger too.

## Optimization Audit Table

For a serious hyperparameter search, I would not only report the winning
configuration. I would keep an optimization audit table:

```text
trial id
configuration
seed
start time and wall time
resource level
metric path, not only final metric
surrogate prediction before launch
posterior uncertainty before launch
acquisition score before launch
reason the trial was chosen
failure or early-stop status
```

This table turns Bayesian optimization from an opaque "AutoML found this" event
into a reproducible sequence of decisions. It lets you ask whether the surrogate
was calibrated, whether the acquisition function was exploring too much or too
little, whether certain regions were never sampled, and whether the winner was
just a lucky noisy trial.

The same audit discipline applies outside ML. A materials-science BO run, a
robotics calibration loop, or a trading-strategy search should preserve the
policy history. The sequence of evaluations is part of the result.

## Policy Accountability

The part that feels underappreciated is not "use a better acquisition function."
It is **policy accountability**.

If an optimizer chooses the next expensive experiment, we should be able to ask:

1. What belief did it have before the experiment?
2. What information did it expect to gain?
3. What cost did it think it was spending?
4. What alternatives did it reject?
5. Did the observation update the belief in the predicted direction?

That suggests a useful benchmark style. Instead of only comparing final regret,
compare the whole decision log:

```text
calibration of posterior intervals over time
regret per unit cost
coverage of important subregions
robustness to kernel misspecification
robustness to noisy incumbents
quality of explanations for chosen trials
performance against random and human baselines
```

This would make Bayesian optimization feel less like a black-box optimizer and
more like a scientific instrument. The goal is not to automate curiosity away.
The goal is to spend curiosity carefully.

## Primary Sources

[^ego]: Donald R. Jones, Matthias Schonlau, and William J. Welch, "Efficient
    Global Optimization of Expensive Black-Box Functions," *Journal of Global
    Optimization*, 1998. <https://link.springer.com/article/10.1023/A%3A1008306431147>

[^gpml]: Carl Edward Rasmussen and Christopher K. I. Williams, *Gaussian
    Processes for Machine Learning*, MIT Press, 2006.
    <https://gaussianprocess.org/gpml/chapters/RW.pdf>

[^snoek]: Jasper Snoek, Hugo Larochelle, and Ryan P. Adams, "Practical Bayesian
    Optimization of Machine Learning Algorithms," NeurIPS 2012.
    <https://arxiv.org/abs/1206.2944>

[^random]: James Bergstra and Yoshua Bengio, "Random Search for Hyper-Parameter
    Optimization," *Journal of Machine Learning Research*, 2012.
    <https://www.jmlr.org/papers/v13/bergstra12a.html>

[^brochu]: Eric Brochu, Vlad M. Cora, and Nando de Freitas, "A Tutorial on
    Bayesian Optimization of Expensive Cost Functions, with Application to
    Active User Modeling and Hierarchical Reinforcement Learning," 2010.
    <https://arxiv.org/abs/1012.2599>

[^frazier]: Peter I. Frazier, "A Tutorial on Bayesian Optimization," 2018.
    <https://arxiv.org/abs/1807.02811>

[^review]: Bobak Shahriari, Kevin Swersky, Ziyu Wang, Ryan P. Adams, and Nando
    de Freitas, "Taking the Human Out of the Loop: A Review of Bayesian
    Optimization," *Proceedings of the IEEE*, 2016.
    <https://collaborate.princeton.edu/en/publications/taking-the-human-out-of-the-loop-a-review-of-bayesian-optimizatio/>
