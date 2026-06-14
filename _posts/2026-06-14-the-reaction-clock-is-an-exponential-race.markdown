---
layout: post
title: "The Next Reaction Wins the Race"
description: "Gillespie's stochastic simulation algorithm samples chemical reaction paths exactly by letting propensities compete as exponential clocks."
date: 2026-06-14 17:04:00 -0400
categories: physics
tags: [gillespie-algorithm, stochastic-simulation, chemical-master-equation, markov-jump-processes, applied-math, systems-biology]
excerpt: "A rate equation draws the smooth shadow. Molecule counts jump. Gillespie's algorithm samples those jumps by racing reaction clocks."
---

A concentration curve is a shadow on the wall.

It is not a molecule count. Molecule counts are integers. They jump. A reaction
happens, the state changes by one stoichiometric vector, and then nothing
happens until the next reaction. If the system is well stirred, the next event is
not scheduled by a fixed time step. It is scheduled by a race.

For reaction channels with propensities \(a_1(x),\ldots,a_M(x)\), define

$$
a_0(x)=\sum_{j=1}^M a_j(x).
$$

Then the waiting time to the next reaction is exponential with rate \(a_0(x)\),
and the probability that the next reaction is channel \(j\) is

$$
\Pr(j \mid x)=\frac{a_j(x)}{a_0(x)}.
$$

This is the small hinge behind Gillespie's stochastic simulation algorithm. Draw
one exponential waiting time. Draw one reaction channel in proportion to its
propensity. Jump the state. Repeat.

No time grid.

No fractional molecules.

No Gaussian dust shaken over an ODE.

## The Smooth Curve Is the Shadow

The classic rate equation begins with concentration. If \(z(t)\) is the
concentration of a species, one writes a differential equation for \(z\). This
is the right language for large, well-mixed test tubes. It is not always the
right primitive for small copy numbers.

Gillespie's 2007 review puts the point bluntly in technical terms: stochastic
chemical kinetics tracks molecular populations as integer-valued random
variables, which can matter when the populations are small.[^gillespie-review]
The older 1976 and 1977 Gillespie papers gave an exact simulation method for
the jump process itself.[^gillespie-1976][^gillespie-1977]

The deterministic equation is not being thrown away. Kurtz showed how the
Markov-chain model and the ordinary differential equation model relate: with
the system volume scaled appropriately, the ODE is the infinite-volume
limit.[^kurtz]

That is the right hierarchy:

```text
finite volume: random jump process
large volume: concentration path concentrates around an ODE
```

The ODE is a law of large numbers. It is not the thing that secretly generates
the jumps.

## A Laboratory With Two Bells

The lab below uses the smallest useful reaction network:

$$
\varnothing \xrightarrow{\alpha V} X,
\qquad
X \xrightarrow{\beta n} \varnothing.
$$

Here \(n\) is the molecule count of \(X\), and \(V\) is the volume scale. The
birth propensity is \(\alpha V\). The death propensity is \(\beta n\).

For the concentration \(z=n/V\), the deterministic rate equation is

$$
\frac{dz}{dt}=\alpha-\beta z,
\qquad
z(0)=0,
$$

so

$$
z(t)=\frac{\alpha}{\beta}(1-e^{-\beta t}).
$$

The jump process also has a convenient exact check. Starting from zero, the
final molecule count at time \(t\) is Poisson with mean

$$
\lambda(t)=V\frac{\alpha}{\beta}(1-e^{-\beta t}).
$$

That gives the lab a real verification target, not just a pretty trace. The
default setting uses \(V=80\), \(\alpha=0.72\), \(\beta=0.18\), horizon 12,
and 140 exact trajectories. On my run, the simulated final mean is 282.6, the
Poisson mean is 283.1, and the Fano factor is 1.01. The average trajectory
needed about 1,095 reaction events.

<style>
  .gillespie-lab {
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

  .gillespie-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .gillespie-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .gillespie-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .gillespie-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .gillespie-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .gillespie-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .gillespie-lab__metric span,
  .gillespie-lab__legend,
  .gillespie-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .gillespie-lab__metric span {
    display: block;
  }

  .gillespie-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .gillespie-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .gillespie-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .gillespie-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .gillespie-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .gillespie-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .gillespie-lab {
      padding: 0.85rem;
    }

    .gillespie-lab__controls {
      grid-template-columns: 1fr;
    }

    .gillespie-lab canvas {
      height: 1100px;
    }
  }
</style>

<div class="gillespie-lab" data-gillespie-lab>
  <div class="gillespie-lab__controls">
    <label>
      Volume V <output data-value="volume">80</output>
      <input type="range" data-param="volume" min="20" max="180" step="1" value="80" aria-label="Volume">
    </label>
    <label>
      Birth rate alpha <output data-value="birth">0.72</output>
      <input type="range" data-param="birth" min="20" max="150" step="1" value="72" aria-label="Birth rate alpha">
    </label>
    <label>
      Death rate beta <output data-value="death">0.18</output>
      <input type="range" data-param="death" min="6" max="32" step="1" value="18" aria-label="Death rate beta">
    </label>
    <label>
      Horizon <output data-value="horizon">12</output>
      <input type="range" data-param="horizon" min="4" max="20" step="1" value="12" aria-label="Time horizon">
    </label>
    <label>
      Trajectories <output data-value="paths">140</output>
      <input type="range" data-param="paths" min="40" max="220" step="10" value="140" aria-label="Trajectory count">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="29" aria-label="Random seed">
    </label>
  </div>
  <div class="gillespie-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Gillespie stochastic simulation lab showing exact jump paths, reaction clock race, final count histogram, and volume noise scaling"></canvas>
  <div class="gillespie-lab__legend">
    <span><i style="background:#0f766e"></i> ODE or theory</span>
    <span><i style="background:#2563eb"></i> SSA ensemble</span>
    <span><i style="background:#15803d"></i> birth clock</span>
    <span><i style="background:#be123c"></i> death clock</span>
  </div>
  <p class="gillespie-lab__note">
    Exact direct-method SSA for an immigration-death process. The histogram
    overlays the analytic Poisson transient distribution, so the simulation has
    a visible correctness check.
  </p>
</div>

<script defer src="{{ '/assets/js/gillespie-race-lab.js' | relative_url }}"></script>

I swept 729 parameter combinations across volume, rates, horizon, trajectory
count, and seed. The built-in checks passed after one code-audit fix: the Fano
factor check now uses a tolerance that widens when the user asks for very few
trajectories, so ordinary Monte Carlo wobble does not masquerade as a broken
simulator.

Try lowering the volume. The average concentration still follows the same ODE
shadow, but the molecule count is noisy enough that individual paths wander.
Raise the volume and the relative noise shrinks. In the default volume ladder,
the empirical coefficient of variation falls from about 10.4% at \(V=20\) to
about 4.35% at \(V=160\).

Now increase the birth rate or decrease the death rate. The total propensity
goes up. Reaction events arrive more often. The waiting time in the race panel
gets smaller because the exponential clock has a larger rate.

The cost of exactness is visible in the "avg events" metric. Gillespie's direct
method is exact for this Markov jump model, but it pays one random draw pair per
reaction event. When copy numbers are huge and propensities are fast, exactness
can become too expensive. That is why later stochastic-kinetics work studies
accelerations such as tau-leaping and hybrid methods.[^gillespie-review][^cao]

## A Gaussian Smudge Is Not a Jump

It is tempting to simulate the concentration equation by adding Gaussian noise:

```text
z <- z + drift * dt + noise * sqrt(dt)
```

Sometimes that is a good approximation. It is not the same object.

The jump process has a state-dependent event rate and integer-valued updates.
At low counts, those integers matter. A molecule cannot be present at level
0.3. A death reaction cannot fire when \(n=0\). A production burst changes the
future rate of degradation because the death clock depends on the current count.

The chemical master equation keeps the full probability distribution over
counts. For the immigration-death network, that distribution is simple enough
to write down. For most reaction networks, the state space grows too quickly.
Gillespie's algorithm is useful because it samples the master equation without
solving all of it.

The simulation loop is short:

```text
while t < T:
  compute propensities a_j(x)
  draw tau ~ Exponential(sum_j a_j(x))
  choose reaction j with probability a_j(x) / sum_j a_j(x)
  x <- x + stoichiometric_change[j]
  t <- t + tau
```

The difficult part is not the loop. The difficult part is the modeling contract:
well stirred, Markovian reaction channels, correct propensities, and a state
description that actually contains the variables driving the reaction hazards.

## Two Clocks, One Ring

One way to remember the direct method is to imagine each reaction channel
running its own exponential clock.

For the birth-death lab:

```text
birth clock rate = alpha V
death clock rate = beta n
```

The minimum of independent exponential clocks is exponential with rate equal to
the sum of their rates. Conditional on which clock rings first, the chance it is
the birth clock is its rate divided by the total rate. That is why the direct
method can draw only one waiting time and one channel.

At the default parameters, a selected state in the middle of the run has
\(n=246\). The birth propensity is \(57.6\). The death propensity is \(44.28\).
The next reaction is therefore a birth with probability about 56.5%. The clock
is not symmetric even though there are only two reactions; it changes whenever
the state changes.

This is the part a smooth curve hides. The ODE says the drift is

$$
\alpha V - \beta n.
$$

The jump process says two things:

```text
net drift = birth rate - death rate
event noise = birth events and death events both keep happening
```

Near stationarity, births and deaths nearly balance in expectation, but the
reaction clocks have not stopped. The count jitters because both clocks keep
ringing.

## Volume Buys Relative Quiet

Increasing \(V\) while keeping \(\alpha\) and \(\beta\) fixed scales molecule
counts without changing the deterministic concentration equation. The final
count mean scales like \(V\), while the standard deviation of a Poisson count
scales like \(\sqrt{V}\). Therefore the relative noise scales like

$$
\frac{\sqrt{\lambda}}{\lambda}=\frac{1}{\sqrt{\lambda}}
\approx O(V^{-1/2}).
$$

That is the visual content of the volume panel. It is not that randomness
disappears. Absolute fluctuations grow. Relative fluctuations shrink.

This distinction matters in any small-number system: gene expression, cell
signaling, queueing, epidemics near extinction, rare-event risk, and even some
game economies. A deterministic equation may be a faithful large-population
limit and still be the wrong simulator for the regime you care about.

The practical question is not:

```text
stochastic or deterministic?
```

It is:

```text
what scale am I pretending to be in?
```

If copy numbers are high, the ODE shadow may be enough. If copy numbers are low,
if extinction matters, if switching matters, or if the distribution rather than
the mean drives the decision, you need the race.

The concentration curve is a shadow. The clock is where the path lives.

[^gillespie-1976]: Daniel T. Gillespie, ["A General Method for Numerically Simulating the Stochastic Time Evolution of Coupled Chemical Reactions"](https://web.mit.edu/endy/www/scraps/signal/JCompPhys%2822%29403.pdf), *Journal of Computational Physics*, 1976.

[^gillespie-1977]: Daniel T. Gillespie, ["Exact Stochastic Simulation of Coupled Chemical Reactions"](https://pubs.acs.org/doi/10.1021/j100540a008), *The Journal of Physical Chemistry*, 1977.

[^gillespie-review]: Daniel T. Gillespie, ["Stochastic Simulation of Chemical Kinetics"](https://labs.engineering.asu.edu/acs/wp-content/uploads/sites/33/2016/08/GillespieOverview2007.pdf), *Annual Review of Physical Chemistry*, 2007.

[^kurtz]: Thomas G. Kurtz, ["The Relationship between Stochastic and Deterministic Models for Chemical Reactions"](https://pubs.aip.org/aip/jcp/article/57/7/2976/83090/The-Relationship-between-Stochastic-and), *The Journal of Chemical Physics*, 1972.

[^cao]: Yang Cao, Daniel T. Gillespie, and Linda R. Petzold, ["Efficient step size selection for the tau-leaping simulation method"](https://pubs.aip.org/aip/jcp/article/124/4/044109/893169/Efficient-step-size-selection-for-the-tau-leaping), *The Journal of Chemical Physics*, 2006.
