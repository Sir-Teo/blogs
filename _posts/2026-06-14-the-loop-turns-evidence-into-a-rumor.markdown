---
layout: post
title: "The Loop Turns Evidence Into a Rumor"
description: "Belief propagation is exact on trees because every message summarizes disjoint evidence. On a loopy graph, the same local rule can double-count its own echo."
date: 2026-06-14 21:18:00 -0400
categories: machine-learning
tags: [belief-propagation, graphical-models, factor-graphs, approximate-inference, bethe-free-energy, message-passing]
excerpt: "Message passing feels magical until a loop sends the same evidence back wearing a different name. The cure is not cynicism; it is verification against exact marginals on small graphs."
---

There is a kind of algorithm that feels too social to be an algorithm.

A node does not see the whole model. It sees its neighbors. Each neighbor sends a
message. The node multiplies the messages it received, mixes in its own local
evidence, and sends a new message back.

Do this across the graph and global inference appears to happen without a global
inference engine.

This is the beautiful promise of belief propagation. It is also the trap.

On a tree, a message is a sufficient statistic for an entire branch of evidence.
On a graph with loops, a message can become evidence that has already passed
through the room once.

The same local rule remains useful. It just stops being a theorem about exact
marginals.

## The Local Rule

Take binary variables `s_i` in `{-1,+1}` with an Ising-style probability model

$$
p(s)\propto
\prod_i \exp(h_i s_i)
\prod_{(i,j)\in E}\exp(J_{ij}s_i s_j).
$$

The unary field `h_i` is local evidence. The pair interaction `J_ij` says
whether neighboring spins prefer to agree or disagree. The exact marginal

$$
p(s_i=+1)
$$

requires summing over every assignment of every other variable. That is fine for
the tiny graphs in this post and impossible as a general strategy.

Belief propagation replaces the global sum with local messages. A message from
node `i` to node `j` is a two-number distribution over `s_j`:

$$
m_{i\to j}(s_j)
\propto
\sum_{s_i}
\exp(h_i s_i)
\exp(J_{ij}s_i s_j)
\prod_{k\in N(i)\setminus j} m_{k\to i}(s_i).
$$

After messages have been updated, the belief at node `i` is

$$
b_i(s_i)\propto
\exp(h_i s_i)\prod_{k\in N(i)}m_{k\to i}(s_i).
$$

Kschischang, Frey, and Loeliger put this in a broader language: factor graphs
represent a global function as a product of local functions, and the
sum-product algorithm computes marginal summaries by passing messages through
that graph.[^kfl] Their paper is a useful antidote to naming confusion because
many familiar algorithms can be read as sum-product on different factorizations.

Pearl's early "inference engines" paper had the same distributed flavor: updated
beliefs and evidence propagate asynchronously through a structured network while
respecting Bayes' rule in the tree-like setting.[^pearl]

The rule is local. The claim, when the graph is a tree, is global.

## Why Trees Are Special

Cut one edge in a tree. The graph separates into two independent pieces.

That is the whole secret.

The message crossing that edge only needs to summarize evidence on one side of
the cut. No path allows the same evidence to leave that side, wander around, and
return through another route. Each branch speaks once.

So on a tree, after enough forward-and-backward passes, belief propagation gives
the exact marginals. It is not an approximation. It is dynamic programming over a
graph shape.

On a loop, cutting one edge does not separate the graph. There is another path
around. A message can contain information that was originally influenced by the
recipient. If you multiply incoming messages as though they came from disjoint
subproblems, you may count the same evidence more than once.

That does not make loopy belief propagation foolish. It makes it approximate.
The astonishing part is how often it remains good.

Yedidia, Freeman, and Weiss gave one of the clean explanations for this: fixed
points of loopy belief propagation correspond to stationary points of the Bethe
free-energy approximation.[^gbp] Their later tutorial emphasizes the boundary:
BP is exact on tree factor graphs and approximate on graphs with cycles.[^yfw]

So the question is not only "did the messages converge?" It is also "what did
they converge to?"

## A Small Rumor Lab

The lab below runs belief propagation on small binary graphical models and, at
the same time, computes exact marginals by enumerating all `2^n` states.

That means the approximation has nowhere to hide.

<style>
  .bp-lab {
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

  .bp-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }

  .bp-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .bp-lab__controls input,
  .bp-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .bp-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .bp-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .bp-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .bp-lab__metric {
    background: #f8fafc;
    border: 1px solid #dfe6ee;
    border-radius: 6px;
    font-family: var(--font-ui);
    min-width: 0;
    padding: 0.62rem 0.7rem;
  }

  .bp-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    line-height: 1.2;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .bp-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .bp-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: block;
    max-width: 100%;
  }

  .bp-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) .bp-lab {
      background: #ffffff;
      color: #172026;
    }
  }

  :root[data-theme="dark"] .bp-lab {
    background: #ffffff;
    color: #172026;
  }
</style>

<div class="bp-lab" data-belief-propagation-lab>
  <div class="bp-lab__controls">
    <label>Graph
      <select data-param="graph">
        <option value="cycle8" selected>Cycle, 8 nodes</option>
        <option value="chain7">Chain, 7 nodes</option>
        <option value="tree7">Tree, 7 nodes</option>
        <option value="grid9">Grid, 9 nodes</option>
        <option value="frustrated8">Frustrated cycle</option>
      </select>
      <output data-value="graph">cycle</output>
    </label>
    <label>Coupling
      <input data-param="coupling" type="range" min="0" max="180" step="1" value="92">
      <output data-value="coupling">0.92</output>
    </label>
    <label>Field
      <input data-param="field" type="range" min="-90" max="90" step="1" value="12">
      <output data-value="field">0.12</output>
    </label>
    <label>Evidence
      <input data-param="evidence" type="range" min="-100" max="100" step="1" value="72">
      <output data-value="evidence">1.71</output>
    </label>
    <label>Damping
      <input data-param="damping" type="range" min="0" max="85" step="1" value="35">
      <output data-value="damping">35%</output>
    </label>
    <label>Iterations
      <input data-param="iterations" type="range" min="1" max="80" step="1" value="28">
      <output data-value="iterations">28</output>
    </label>
  </div>
  <div class="bp-lab__metrics" data-metrics></div>
  <canvas data-canvas width="680" height="780" role="img" aria-label="Interactive belief propagation lab comparing BP and exact marginals"></canvas>
  <p class="bp-lab__note">Node fill shows the BP marginal for s_i = +1. The outer ring uses the exact marginal from enumeration. The audit checks message normalization, finite exact and Bethe log-partition values, and exact tree behavior when the graph is acyclic and enough iterations are run.</p>
</div>

<script src="{{ '/assets/js/belief-propagation-lab.js?v=20260614a' | relative_url }}"></script>

The default graph is a single 8-node cycle with positive couplings, a small
background field, and evidence at node 0. After 28 damped sweeps:

```text
max marginal error       0.00441258
final message residual   2.11739e-5
exact logZ               9.957453
Bethe logZ error         0.00458814
audit                    passed
```

Switch to the chain or the tree and the story changes:

```text
chain max marginal error       3.33e-16
chain Bethe logZ error         1.78e-15
tree max marginal error        3.33e-16
tree Bethe logZ error          1.78e-15
```

Those are roundoff errors. On the acyclic graphs, the local messages recover the
same marginals as brute-force enumeration.

Now switch to the `3x3` grid, push coupling higher, and watch the error
curve. The residual can become tiny while the marginal error remains large. That
is the lesson: convergence of messages is not the same thing as correctness of
marginals.

## The Bethe Ledger

The lab also computes a Bethe estimate of the log partition function.

The exact partition function is

$$
Z=\sum_s
\prod_i \exp(h_i s_i)
\prod_{(i,j)}\exp(J_{ij}s_i s_j).
$$

For the tiny graphs here, the code computes `log Z` exactly by enumeration.
It also builds BP node beliefs `b_i` and edge beliefs `b_ij`, then evaluates
the Bethe free-energy approximation:

$$
F_B(b)=
\sum_{(i,j)}
\sum_{s_i,s_j}
b_{ij}(s_i,s_j)
\log\frac{b_{ij}(s_i,s_j)}{\psi_{ij}(s_i,s_j)}
+
\sum_i (1-d_i)\sum_{s_i} b_i(s_i)\log b_i(s_i)
-
\sum_i\sum_{s_i}b_i(s_i)\log\phi_i(s_i).
$$

The estimate is `log Z_B = -F_B`.

Why include this instead of only marginal error? Because loopy BP is not merely a
bag of message updates. At a fixed point, it is tied to a variational
approximation. The messages are the computational surface; the Bethe free energy
is the accounting ledger underneath.

That ledger is exact on trees in the lab. I initially wrote the implementation
with unary evidence counted in the wrong term. The tree marginal check still
passed, but the tree Bethe `log Z` did not. That is exactly why small exact
enumerators are worth keeping around: they catch mistakes that a pretty picture
will happily tolerate.

## What Loops Do

A loop creates a second route for influence.

In a ferromagnetic cycle, evidence at node 0 pushes node 1 and node 7 positive.
They push their neighbors. Eventually the evidence returns to node 0 from the
other direction. The algorithm has no memory saying: this support was partly me.

Damping can make the iteration calmer:

$$
m_{\text{new}}\leftarrow
\lambda m_{\text{old}}+(1-\lambda)m_{\text{fresh}}.
$$

It may help convergence. It does not restore the tree theorem.

The frustrated cycle is more dramatic. One edge prefers disagreement while the
others prefer agreement. There is no assignment that satisfies every strong
preference at once. Messages can settle into a compromise, oscillate, or converge
slowly depending on coupling, field, evidence, and damping. This is not a bug in
the lab. It is the model arguing with itself.

The right mental model is:

```text
residual tells you whether the conversation stopped changing;
exact enumeration tells you whether the conversation was right.
```

For large real models, exact enumeration is unavailable. But for small models it
is cheap enough to become a unit test for your intuition.

## Why ML People Should Care

Belief propagation is one member of a larger family: local computation on a
graph. Modern machine learning has many relatives:

- graph neural networks aggregate neighbor messages;
- diffusion and autoregressive models hide tractable local conditionals inside
  larger probabilistic stories;
- error-correcting decoders pass soft information around sparse parity-check
  graphs;
- variational inference replaces exact normalization with an optimized surrogate.

The point is not that all of these are BP. The point is that the same structural
question keeps returning:

> When does a local message summarize independent evidence, and when does it
> recirculate dependence?

If the graph is a tree, locality is a theorem. If the graph has loops, locality
is an approximation whose quality depends on the geometry and strength of
interactions.

That is why "message passing" is both powerful and dangerous as a metaphor. A
message is not automatically information. Sometimes it is an echo with a
different timestamp.

## Verification Notes

The JavaScript lab exports the exact enumerator, BP runner, and evaluator used by
the page. The Node verification covered:

```text
default cycle       error 0.00441258   residual 2.11739e-5
chain tree check    error 3.33e-16     Bethe logZ error 1.78e-15
branching tree      error 3.33e-16     Bethe logZ error 1.78e-15
strong cycle        error 0.0191498    residual 7.71634e-7
3x3 grid            error 0.529382     residual 6.63134e-7
frustrated cycle    error 0.147706     residual 8.43693e-4
clamped inputs      audit passed
```

The audit checks finite messages, normalized messages, finite exact `log Z`,
finite Bethe `log Z`, finite residuals, exact tree marginals, and exact tree
Bethe partition values.

The uncomfortable row is the grid: the residual is tiny and the marginal error is
large. That is the post in one line.

[^pearl]: Judea Pearl, ["Reverend Bayes on Inference Engines: A Distributed Hierarchical Approach"](https://ftp.cs.ucla.edu/pub/stat_ser/r30-reprint.pdf), AAAI, 1982.

[^kfl]: Frank R. Kschischang, Brendan J. Frey, and Hans-Andrea Loeliger, ["Factor Graphs and the Sum-Product Algorithm"](https://vision.unipv.it/IA2/Factor%20graphs%20and%20the%20sum-product%20algorithm.pdf), *IEEE Transactions on Information Theory* 47(2), 498-519, 2001. DOI: [10.1109/18.910572](https://doi.org/10.1109/18.910572).

[^gbp]: Jonathan S. Yedidia, William T. Freeman, and Yair Weiss, ["Generalized Belief Propagation"](https://proceedings.neurips.cc/paper/2000/hash/61b1fb3f59e28c67f3925f3c79be81a1-Abstract.html), NeurIPS 2000.

[^yfw]: Jonathan S. Yedidia, William T. Freeman, and Yair Weiss, ["Constructing Free-Energy Approximations and Generalized Belief Propagation Algorithms"](https://miat.inrae.fr/GMtoolbox/YedidaFreemanWeiss2004.pdf), *IEEE Transactions on Information Theory* 51(7), 2282-2312, 2005.
