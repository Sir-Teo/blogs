---
layout: post
title: "The Tape Runs Backward"
description: "Reverse-mode automatic differentiation is not numerical differencing and not symbolic algebra. It is a transposed execution of the program, and the tape is the memory bill."
date: 2026-06-14 04:51:00 -0400
categories: machine-learning
tags: [automatic-differentiation, reverse-mode, backpropagation, checkpointing, differentiable-programming, ml-systems]
excerpt: "A gradient is not found by nudging every parameter one at a time. Reverse mode runs the computation forward once, saves the receipts, then spends them backward."
---

There is a small lie hidden in the phrase "take the gradient."

It makes the gradient sound like a mathematical object waiting politely beside
the function. In software, the gradient is a second computation. Someone has to
build it, schedule it, store what it needs, and decide what to recompute when
memory runs out.

Finite differences ask the function a clumsy question:

```text
What happens if I wiggle parameter 17?
What happens if I wiggle parameter 18?
What happens if I wiggle parameter 19?
...
```

Reverse-mode automatic differentiation asks a different question:

```text
Which earlier quantities were responsible for this final scalar?
```

Then it runs the program backward.

Not backward in time as poetry. Backward as accounting.

## Not Symbolic, Not Numerical

Baydin, Pearlmutter, Radul, and Siskind describe automatic differentiation as a
family of techniques for accurately evaluating derivatives of numeric programs,
distinct from hand-coded derivatives, finite differences, and symbolic
manipulation.[^baydin] That distinction matters.

Symbolic differentiation manipulates expressions. It may simplify

$$
\frac{d}{dx}\sin(x^2)
$$

into

$$
2x\cos(x^2).
$$

Finite differences evaluate the original program at nearby inputs:

$$
\frac{f(x+h)-f(x-h)}{2h}.
$$

Automatic differentiation runs the actual program, but augments each primitive
operation with local derivative information. For

$$
z = a x + b,\qquad y = \tanh(z),
$$

the forward value \(y\) is ordinary computation. The derivative facts

$$
\frac{\partial y}{\partial z}=1-\tanh^2(z),\quad
\frac{\partial z}{\partial a}=x,\quad
\frac{\partial z}{\partial x}=a
$$

are local receipts.

Reverse mode keeps those receipts until the final output is known.

## A Chain Has a Transpose

Consider a scalar computation that evolves a state through many steps:

$$
x_{t+1}=\phi_t(x_t,a_t,b_t),\qquad
L=\frac12(x_T-y)^2.
$$

There are \(2T\) parameters, two per step. A finite-difference gradient with
central differences evaluates the whole chain about \(4T+1\) times. Forward mode
can propagate all \(2T\) parameter tangents at once, but each step carries a
large derivative vector. Reverse mode does something stranger and better for a
scalar output.

First run forward and remember the needed intermediate values. Then define the
adjoint

$$
\bar{x}_t = \frac{\partial L}{\partial x_t}.
$$

At the end,

$$
\bar{x}_T=x_T-y.
$$

Then for \(t=T-1,T-2,\ldots,0\),

$$
\frac{\partial L}{\partial a_t}
=
\bar{x}_{t+1}
\frac{\partial \phi_t}{\partial a_t},
\qquad
\frac{\partial L}{\partial b_t}
=
\bar{x}_{t+1}
\frac{\partial \phi_t}{\partial b_t},
$$

and

$$
\bar{x}_t
=
\bar{x}_{t+1}
\frac{\partial \phi_t}{\partial x_t}.
$$

That is the whole trick. The program's dependency graph has been transposed.
The final scalar sends blame backward through every edge.

Paul Werbos's 1974 thesis placed this kind of backward differentiation inside
learning systems and network models.[^werbos] Seppo Linnainmaa's work on
algorithmic determination of Taylor coefficients makes the reverse traversal
and storage burden visible from the numerical-analysis side: first-order
coefficients can be computed by reading saved operation information in reverse
order, and the storage needed for that information is a central concern.[^linnainmaa]

Backpropagation is not a special neural-network spell. It is reverse-mode AD
applied to the particular program that evaluates a network loss.

## The Tape Is the Price

The forward pass produces values. The backward pass needs many of them.

For the chain above, \(\partial \phi_t/\partial a_t\) depends on \(x_t\), and
\(\partial \phi_t/\partial x_t\) depends on the local preactivation. If those
values are gone, the backward pass cannot pay its bills. It must either store
them or recompute them.

This is why deep learning systems talk about "activation memory." The expensive
object is often not just the parameters. It is the tape of intermediate values
needed to transpose the computation.

Griewank and Walther's revolve checkpointing work starts from exactly this
pressure: reverse mode can compute a scalar-output gradient at a small multiple
of the original evaluation cost, but the original formulation needs memory
proportional to the runtime of the evaluation program.[^revolve] Checkpointing
stores selected intermediate states and recomputes missing pieces later.

That trade is not an implementation detail. It changes which models fit.

```text
store everything: fast backward, large tape
store almost nothing: tiny tape, huge recomputation
checkpoint: spend extra compute to buy memory back
```

## A Tape Lab

The lab below differentiates a deterministic nonlinear chain:

$$
x_{t+1}
=
\tanh(a_t x_t+b_t)
+ c\frac{x_t}{1+x_t^2}
+ 0.025\sin(0.11(t+1)x_t).
$$

It computes the full gradient with:

1. **reverse mode**, by saving local receipts and sweeping backward;
2. **forward mode**, by carrying all parameter tangents forward;
3. **central finite differences**, by perturbing every parameter.

The same code also models a simple periodic checkpoint schedule. This is not
the optimal revolve schedule; it is deliberately plain so the memory/recompute
tradeoff is visible.

<style>
  .adjoint-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .adjoint-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .adjoint-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .adjoint-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .adjoint-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .adjoint-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .adjoint-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.25rem;
    padding: 0.62rem 0.7rem;
  }

  .adjoint-lab__metric span,
  .adjoint-lab__legend,
  .adjoint-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .adjoint-lab__metric span {
    display: block;
  }

  .adjoint-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .adjoint-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .adjoint-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .adjoint-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .adjoint-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .adjoint-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="adjoint-lab" data-adjoint-tape-lab>
  <div class="adjoint-lab__controls">
    <label>
      Chain steps: <output data-value="steps">40</output>
      <input type="range" min="8" max="96" step="4" value="40" data-param="steps">
    </label>
    <label>
      Nonlinearity: <output data-value="nonlinearity">45%</output>
      <input type="range" min="0" max="100" step="5" value="45" data-param="nonlinearity">
    </label>
    <label>
      Finite diff epsilon: <output data-value="epsPower">1e-6</output>
      <input type="range" min="-13" max="-2" step="1" value="-6" data-param="epsPower">
    </label>
    <label>
      Checkpoint stride: <output data-value="checkpointStride">8</output>
      <input type="range" min="1" max="96" step="1" value="8" data-param="checkpointStride">
    </label>
    <label>
      Seed: <output data-value="seed">19</output>
      <input type="range" min="1" max="99" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="adjoint-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="690" aria-label="Reverse-mode automatic differentiation lab comparing gradients, finite-difference step sizes, work, and checkpoint memory"></canvas>
  <div class="adjoint-lab__legend">
    <span><i style="background:#0f766e"></i> Reverse mode</span>
    <span><i style="background:#2563eb"></i> Forward mode / selected point</span>
    <span><i style="background:#be123c"></i> Finite differences</span>
    <span><i style="background:#7c3aed"></i> Checkpoint schedule</span>
  </div>
  <p class="adjoint-lab__note">
    Deterministic toy experiment. Work ratios count full-chain evaluations as
    the unit and ignore constant-factor primitive costs. The checkpoint panel
    uses a simple periodic policy, not the optimal revolve schedule.
  </p>
</div>
<script defer src="{{ '/assets/js/adjoint-tape-lab.js?v=20260614a' | relative_url }}"></script>

Move **Finite diff epsilon** left and right. Too large an epsilon measures the
wrong secant; too small an epsilon subtracts nearly equal floating-point
numbers. The error curve bends because numerical differentiation is balancing
truncation error against roundoff error.

Now raise **Chain steps**. The number of parameters rises with the length of the
program. Reverse mode still sends one adjoint backward through the chain, while
finite differences ask the entire program a separate question for every
parameter.

Finally change **Checkpoint stride**. A stride of 1 is the full tape: fast
backward, high memory. Moderate strides store fewer states and replay local
segments once. Storing nothing would save memory but force repeated long
recomputations.

## What Frameworks Hide

PyTorch, JAX, TensorFlow, Enzyme, Tapenade, ADOL-C, and friends hide a lot of
machinery, but they do not remove the tradeoff.

When you call `backward()`, some execution trace has to exist. In eager systems
it may be a dynamic tape. In compiled systems it may be an intermediate
representation transformed by compiler passes. In either case, reverse mode is
not free because the backward program needs information from the forward
program.

That is why small source-level changes can have huge memory effects:

- saving an activation versus recomputing it,
- fusing an operation versus exposing an intermediate,
- differentiating through a loop versus stopping the gradient,
- checkpointing a block versus storing its full tape,
- using forward mode for a Jacobian-vector product instead of reverse mode for
  a vector-Jacobian product.

The gradient is a program. Optimizing gradient computation is program
optimization.

## The Backward Pass Is a Ledger

The most useful mental model is not "calculus happens."

It is this:

```text
the forward pass creates value receipts
the backward pass spends them in reverse causal order
```

Finite differences are valuable as a test. Symbolic derivatives are valuable
when expressions are small enough to manipulate. But modern differentiable
programming runs on the tape, the transpose, and the memory system.

Once you see that, backpropagation feels less like a miracle and more like a
beautifully disciplined accounting trick.

## Notes

[^baydin]: Atilim Gunes Baydin, Barak A. Pearlmutter, Alexey Andreyevich Radul, and Jeffrey Mark Siskind, "Automatic Differentiation in Machine Learning: a Survey," *Journal of Machine Learning Research*, 2018. [JMLR](https://jmlr.org/papers/v18/17-468.html), [PDF](https://www.jmlr.org/papers/volume18/17-468/17-468.pdf), [arXiv](https://arxiv.org/abs/1502.05767).

[^werbos]: Paul J. Werbos, "Beyond Regression: New Tools for Prediction and Analysis in the Behavioral Sciences," PhD thesis, Harvard University, 1974. [PDF](https://gwern.net/doc/ai/nn/1974-werbos.pdf).

[^linnainmaa]: Seppo Linnainmaa, "Taylor expansion of the accumulated rounding error," *BIT*, 1976. [PDF](https://papers.baulab.info/papers/also/Linnainmaa-1976.pdf).

[^revolve]: Andreas Griewank and Andrea Walther, "Algorithm 799: revolve: an implementation of checkpointing for the reverse or adjoint mode of computational differentiation," *ACM Transactions on Mathematical Software*, 2000. [ACM](https://dl.acm.org/doi/10.1145/347837.347846), [Semantic Scholar](https://www.semanticscholar.org/paper/Algorithm-799%3A-revolve%3A-an-implementation-of-for-or-Griewank-Walther/766cd91c0d8650495529cab7d4eeed482729cf89).
