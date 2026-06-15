---
layout: post
title: "The Controller Solves Backward"
description: "Finite-horizon LQR turns a future cost into a present feedback law. The Riccati recursion runs backward; the controller runs forward."
date: 2026-06-14 21:06:00 -0400
categories: applied-math
tags: [optimal-control, lqr, riccati-equation, dynamic-programming, control-theory, reinforcement-learning]
excerpt: "A finite-horizon controller is not just a gain. It is a compressed argument about every future mistake you are still able to correct."
---

A good controller is not a reflex.

It looks like one. The system is here, the controller pushes there, and the
state moves. If all you see is the deployed policy, linear quadratic regulation
looks almost disappointingly simple:

$$
u_t = -K_t x_t.
$$

But the gain \(K_t\) is not guessed from the present. It is distilled from the
future.

Finite-horizon LQR is a clean place to see this because everything is visible.
The dynamics are linear. The loss is quadratic. The optimal value function stays
quadratic. The huge tree of possible future actions collapses into one backward
matrix recursion.

The controller acts forward, but it is solved backward.

## Start From the End

Suppose a one-dimensional mass has state

$$
x_t =
\begin{bmatrix}
\text{position}_t \\
\text{velocity}_t
\end{bmatrix},
\qquad
x_{t+1}=A x_t + B u_t.
$$

The browser lab uses a discretized acceleration model with mild velocity drag:

$$
A=
\begin{bmatrix}
1 & \Delta t \\
0 & d
\end{bmatrix},
\qquad
B=
\begin{bmatrix}
\frac{1}{2}\Delta t^2 \\
\Delta t
\end{bmatrix}.
$$

The objective is to spend little state error and little control effort:

$$
J =
x_N^T Q_f x_N +
\sum_{t=0}^{N-1}
\left(x_t^T Q x_t + u_t^T R u_t\right),
\qquad
Q\succeq 0,\ R\succ 0.
$$

Bellman's dynamic programming idea is to price a decision by the cost it pays
now plus the optimal cost-to-go after the decision.[^bellman] For LQR, make the
quadratic ansatz

$$
V_t(x)=x^T P_t x.
$$

At the terminal time, \(P_N=Q_f\). If \(P_{t+1}\) is known, then the best action
at time \(t\) solves

$$
\min_u\;
x^T Q x + u^T R u + (Ax+Bu)^T P_{t+1}(Ax+Bu).
$$

That is just a quadratic minimization in \(u\). The answer is a feedback law:

$$
u_t^* = -K_t x_t,
\qquad
K_t =
\left(R+B^T P_{t+1}B\right)^{-1}B^T P_{t+1}A.
$$

Substitute that action back into the value function and the future price moves
one step earlier:

$$
P_t =
Q + A^T P_{t+1}A
- A^T P_{t+1}B
\left(R+B^T P_{t+1}B\right)^{-1}
B^T P_{t+1}A.
$$

That is the discrete Riccati recursion. MIT's Underactuated Robotics notes give
the same finite-horizon derivation and emphasize the backward solve; Harvard's
optimal control notes frame LQR as one of the cases where dynamic programming
can be implemented exactly.[^tedrake][^yang]

This is the part worth lingering on: LQR does not search over action sequences
online. It does the search symbolically, offline, inside \(P_t\). At runtime the
controller only evaluates a matrix-vector product.

## A Small Riccati Bench

The lab below computes the finite-horizon controller from scratch in the browser.
It draws four views:

- the phase-plane path with value contours;
- the forward trace of position, velocity, and control;
- the backward sequence of feedback gains;
- the tradeoff curve from making control cheap or expensive.

There is also an artificial velocity kick partway through the run. The Riccati
solve is still computed for the nominal model, but the policy is feedback, so it
reacts to the disturbed state without replanning.

<style>
  .lqr-lab {
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

  .lqr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }

  .lqr-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .lqr-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .lqr-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .lqr-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .lqr-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 6px;
    font-family: var(--font-ui);
    min-width: 0;
    padding: 0.62rem 0.7rem;
  }

  .lqr-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .lqr-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .lqr-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }

  .lqr-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .lqr-lab {
      background: #ffffff;
      color: #172026;
    }
  }

  :root[data-theme="dark"] .lqr-lab {
    background: #ffffff;
    color: #172026;
  }
</style>

<div class="lqr-lab" data-lqr-riccati-lab>
  <div class="lqr-lab__controls">
    <label>Horizon
      <input data-param="horizon" type="range" min="16" max="80" step="1" value="42">
      <output data-value="horizon">42</output>
    </label>
    <label>Position cost
      <input data-param="positionCost" type="range" min="4" max="120" step="1" value="34">
      <output data-value="positionCost">3.40</output>
    </label>
    <label>Velocity cost
      <input data-param="velocityCost" type="range" min="0" max="80" step="1" value="8">
      <output data-value="velocityCost">0.80</output>
    </label>
    <label>Control cost
      <input data-param="controlCost" type="range" min="4" max="260" step="1" value="46">
      <output data-value="controlCost">0.46</output>
    </label>
    <label>Terminal weight
      <input data-param="terminalWeight" type="range" min="2" max="80" step="1" value="24">
      <output data-value="terminalWeight">2.40x</output>
    </label>
    <label>Start position
      <input data-param="startPos" type="range" min="-300" max="300" step="1" value="210">
      <output data-value="startPos">2.10</output>
    </label>
    <label>Start velocity
      <input data-param="startVel" type="range" min="-180" max="180" step="1" value="-45">
      <output data-value="startVel">-0.45</output>
    </label>
    <label>Velocity kick
      <input data-param="gust" type="range" min="-120" max="120" step="1" value="42">
      <output data-value="gust">0.42</output>
    </label>
    <label>Drag
      <input data-param="drag" type="range" min="0" max="12" step="1" value="2">
      <output data-value="drag">2%</output>
    </label>
  </div>
  <div class="lqr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="680" height="780" role="img" aria-label="Interactive finite-horizon LQR Riccati lab"></canvas>
  <p class="lqr-lab__note">The audit checks positive Riccati denominators, symmetric positive semidefinite cost matrices, the one-step Bellman identity, and equality between the simulated nominal cost and \(x_0^T P_0x_0\).</p>
</div>

<script src="{{ '/assets/js/lqr-riccati-lab.js?v=20260614a' | relative_url }}"></script>

The default settings give a concrete scale:

```text
nominal dynamic-programming cost    112.518116
simulated nominal cost              112.518116
max Bellman identity error          5.68e-14
minimum Riccati eigenvalue          1.92
coast / LQR disturbed cost ratio    3.019x
terminal norm after kick            0.0213
```

The last two numbers include the kick. With no controller, the same disturbance
is roughly three times as expensive under the chosen quadratic loss. With the
LQR feedback, the state returns close to the origin because the controller is not
following a precomputed action list. It is reading the current state through the
future-cost matrix.

## What the Matrix Knows

The matrix \(P_t\) is not a covariance matrix, although it can look like one when
drawn as ellipses. It is a price matrix. The number

$$
x^T P_t x
$$

is the cost-to-go from state \(x\) at time \(t\), assuming every future action is
chosen optimally.

This explains why the ellipses in the phase portrait matter. A direction in
state space is expensive if it leads to costly future corrections. Velocity can
be cheap near the beginning of a long horizon because there is time to bleed it
away. The same velocity can become expensive near the end because the controller
has fewer remaining moves.

That is also why the gain sequence changes with time. A long horizon often
settles into a near steady-state feedback away from the terminal boundary. Near
the end, the terminal cost bends the value function and the gains adjust.
Stanford's EE363 notes make this steady-state point explicitly: away from the
horizon, the finite-horizon LQR feedback approaches the algebraic Riccati
solution under the usual controllability/observability conditions.[^stanford]

The lab's "backward pass" panel is that story as a graph.

## Cheap Control, Expensive Control

The most useful knob is \(R\), the control cost.

Lower \(R\) and the controller is willing to spend force. The path snaps toward
zero quickly, but the peak control grows. Raise \(R\) and the controller becomes
patient. It coasts more, pushes less, and accepts a larger terminal error.

This sounds like tuning, but it is more precise than tuning a proportional gain.
Changing \(R\) changes the optimization problem. The gain is an output of the
problem, not the problem itself.

That distinction is one reason LQR keeps reappearing in robotics, aerospace,
economics, portfolio models, model predictive control, and reinforcement
learning examples. It is not because real systems are all linear and quadratic.
They are not. It is because LQR is the rare control problem where the value
function, the feedback law, and the verification certificate all fit in a few
matrices.

Kalman's early state-space optimal-control work helped put these objects in the
language still used today: state, control, controllability, observability, and
quadratic performance.[^kalman] The modern descendants are everywhere. Iterative
LQR and differential dynamic programming repeatedly linearize nonlinear dynamics
and solve local Riccati-like subproblems. Model predictive control repeatedly
solves finite-horizon control problems, applies the first action, then solves
again from the new state. Many policy-gradient papers use LQR as the test case
where the answer is known and bad intuitions become measurable.

LQR is a small exact island in a very large approximate ocean.

## The Verification Is the Point

The lab does not merely draw a smooth curve and call it optimal. It checks the
identity that makes the recursion meaningful:

$$
x^T P_t x =
x^T Q x + u_t^T R u_t
+ (Ax+B u_t)^T P_{t+1}(Ax+B u_t),
\qquad
u_t=-K_t x.
$$

For the default parameters, the largest one-step error over several probe states
and all time steps is about \(5.68\times 10^{-14}\), which is floating-point
roundoff. The nominal simulation cost exactly matches \(x_0^TP_0x_0\) to the same
precision.

That identity is a better debugging tool than a plot. A plot can look stable
while the gain is transposed, while \(B^TPA\) is evaluated with the wrong \(P\),
or while the terminal condition is off by one. The Bellman equality catches those
mistakes because it prices the same future two ways.

This is the small lesson I like most:

```text
If a feedback law claims to be optimal,
ask it to balance its own accounting ledger.
```

For LQR, the ledger is \(P_t\). It is the future, compressed into a quadratic
form, mailed backward one time step at a time.

## What This Is Not

This lab is not solving constrained control. The input is unconstrained, so cheap
control can imply unrealistically large forces. It is not robust control, even
though the feedback handles the injected kick. It is not learning a model. The
matrices \(A\) and \(B\) are known.

Those omissions are not footnotes; they are the boundary of the theorem. Once
you add actuator limits, model uncertainty, nonlinear dynamics, partial
observation, or learned dynamics, the exact quadratic story breaks. But the
shape remains useful:

1. write the future cost as a value function;
2. push that value function backward;
3. use the resulting local geometry to act forward;
4. verify the accounting identity you claim to optimize.

That pattern is older than modern reinforcement learning and still one of its
clearest mirrors.

## Verification Notes

The JavaScript implementation exports the same evaluator used by the browser.
The Node audit ran the default case plus cheap-control, expensive-control,
zero-velocity-penalty, long-horizon, and clamped-parameter cases.

For the default:

```text
P_t finite                         true
R + B^T P_{t+1} B positive          true
P_t symmetric                      true
P_t positive semidefinite           true
Bellman identity error < 1e-8       true
nominal cost equals x0^T P0 x0      true
```

The implementation also sweeps \(R\) to draw the energy/error tradeoff curve.
That sweep is intentionally not used as proof of optimality. It is a sensitivity
view: the theorem says each point is optimal for its own selected cost, not that
there is one cost everyone should have meant.

[^bellman]: Richard Bellman, ["On the Theory of Dynamic Programming"](https://www.pnas.org/doi/10.1073/pnas.38.8.716), *PNAS* 38(8), 716-719, 1952; and ["The theory of dynamic programming"](https://www.ams.org/bull/1954-60-06/S0002-9904-1954-09848-8/), *Bulletin of the American Mathematical Society* 60(6), 503-515, 1954.

[^kalman]: R. E. Kalman, "Contributions to the Theory of Optimal Control," *Boletin de la Sociedad Matematica Mexicana* 5, 102-119, 1960. Springer lists the reproduced article and original citation details [here](https://link.springer.com/article/10.1007/s12045-024-1309-5).

[^tedrake]: Russ Tedrake, ["Linear Quadratic Regulators"](https://underactuated.mit.edu/lqr.html), *Underactuated Robotics*. The notes derive both continuous-time and discrete-time LQR and show the Riccati equations solved backward from terminal conditions.

[^yang]: Heng Yang, ["Exact Dynamic Programming"](https://hankyang.seas.harvard.edu/OptimalControlEstimation/exactdp.html), *Optimal Control and Estimation*. The chapter sets up finite-horizon discrete-time LQR and the backward dynamic-programming computation.

[^stanford]: Stephen Boyd's Stanford EE363 review slides summarize the discrete-time algebraic Riccati equation, finite-horizon behavior, and the convergence of feedback gains away from the horizon: [Review Session 5](https://stanford.edu/class/ee363/sessions/s5slides.pdf).
