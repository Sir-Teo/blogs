---
layout: post
title: "The Graph Forgets the Triangles"
description: "Message-passing graph neural networks inherit a precise blind spot from color refinement. The 1-WL test can be strong, but it can also stare at two triangles and a six-cycle and see the same graph."
date: 2026-06-17 01:26:00 -0400
categories: machine-learning
tags: [graph-neural-networks, message-passing, weisfeiler-leman, color-refinement, graph-isomorphism, ml-theory, gnn]
excerpt: "A message-passing GNN does not merely learn from a graph. Under common assumptions, it sees through the eyes of a color-refinement algorithm."
---

A graph neural network can look busy.

Messages move along edges. Node states get updated. A graph-level embedding
appears at the end. The whole procedure feels geometric and learned and
continuous.

But for a large and important family of graph neural networks, there is a
small discrete machine hiding under the hood:

```text
color refinement
```

That machine is also called the 1-dimensional Weisfeiler-Leman test, or 1-WL.
It is not a metaphor. It is the algorithmic shadow of ordinary message passing.

If the shadow cannot separate two graphs, then a message-passing model with the
same information contract cannot be trained, widened, or optimizer-tuned into
separating them. The model can be useful. It can be state of the art on a real
dataset. It can still have this exact blind spot.

The simplest version is almost rude:

```text
a six-cycle       versus       two disconnected triangles
```

They have different triangle counts. They have different connected-component
counts. They are obviously not isomorphic. And 1-WL, starting from identical
node features, does not distinguish them.

## The Contract

Gilmer et al. gave a clean name to a broad class of graph models: Message
Passing Neural Networks.[^gilmer] In the common form, each layer updates node
`v` from its current state and a permutation-invariant summary of its neighbors:

$$
h_v^{(t+1)} =
\phi_t\left(h_v^{(t)}, \operatorname{AGG}_t\{h_u^{(t)} : u \in N(v)\}\right).
$$

Then a readout pools node states into a graph representation.

This recipe is natural because graphs do not come with a canonical order of
neighbors. The node called `17` in memory is not semantically the seventeenth
node in the object. So the aggregator has to be symmetric: sum, mean, max,
attention over a multiset, or another order-insensitive operation.

That symmetry is the beginning of the theorem.

Color refinement uses the same recursive idea without neural parameters:

```text
initial color of every node
repeat:
  new color(v) = hash(old color(v), multiset of old colors of neighbors)
```

At graph level, compare the histogram of node colors after every round. If the
histograms ever differ, the graphs are not isomorphic. If they never differ,
1-WL gives up. The graphs may still be different.

Kiefer and McKay describe color refinement as a central graph-isomorphism
subroutine and give the same iterative definition in terms of a vertex color
plus the multiset of neighbor colors.[^kiefer]

Xu et al. and Morris et al. made the neural connection precise from the GNN
side.[^xu][^morris] In short: under the usual neighborhood-aggregation setup,
message passing is bounded by 1-WL in its ability to distinguish graph
structure. With sufficiently injective aggregation and update functions, a
model such as GIN can reach the 1-WL boundary. Mean and max aggregators can be
weaker because they can collapse different multisets even before 1-WL would.

So 1-WL is not the whole story of graph learning.

It is the ceiling for this particular kind of story.

## A Four-Graph Microscope

The lab below runs exact joint color refinement on graph pairs. The two graphs
share the same color dictionary at every round, so the histograms are directly
comparable. The rightmost panel deliberately tracks facts that color refinement
may miss: triangle count, connected components, edge count, and bipartiteness.

<style>
  .wl-lab {
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

  .wl-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }

  .wl-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .wl-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .wl-lab input,
  .wl-lab select {
    font: inherit;
    min-height: 2rem;
    width: 100%;
  }

  .wl-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.2rem 0.45rem;
  }

  .wl-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .wl-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .wl-lab__metric.good {
    border-color: #9ed8c5;
  }

  .wl-lab__metric.warn {
    border-color: #f1c889;
  }

  .wl-lab__metric.bad {
    border-color: #f0b7b7;
  }

  .wl-lab__metric span,
  .wl-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .wl-lab__metric span {
    display: block;
  }

  .wl-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .wl-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .wl-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .wl-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .wl-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .wl-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .wl-lab {
      padding: 0.75rem;
    }

    .wl-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="wl-message-passing-lab" class="wl-lab" data-wl-message-passing-lab>
  <div class="wl-lab__controls">
    <label>
      Graph pair: <output data-value="pair">C6 vs two triangles</output>
      <select data-param="pair" aria-label="Graph pair">
        <option value="c6-triangles" selected>C6 vs two triangles</option>
        <option value="prism-k33">prism vs K3,3</option>
        <option value="path-cycle">path vs cycle</option>
        <option value="c6-relabel">C6 vs relabeled C6</option>
      </select>
    </label>
    <label>
      Refinement round: <output data-value="round">0</output>
      <input type="range" min="0" max="6" step="1" value="0" data-param="round" aria-label="Refinement round">
    </label>
  </div>
  <div class="wl-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="820" aria-label="Color refinement and message passing lab comparing graph pairs, color histograms, and missed structural facts"></canvas>
  <div class="wl-lab__legend">
    <span><i style="background:#2563eb"></i> color class</span>
    <span><i style="background:#0f766e"></i> new class</span>
    <span><i style="background:#d97706"></i> selected round</span>
    <span><i style="background:#be123c"></i> hidden gap</span>
    <span><i style="background:#172026"></i> right graph bars</span>
  </div>
  <p class="wl-lab__note">
    Exact deterministic 1-WL experiment. The audit verifies the C6 versus two
    triangles failure, the triangular prism versus K3,3 failure, the path
    versus cycle positive control, the relabeling sanity check, graph validity,
    triangle counts, component counts, and bipartiteness.
  </p>
</div>
<script defer src="{{ '/assets/js/wl-message-passing-lab.js?v=20260617a' | relative_url }}"></script>

Start with **C6 vs two triangles**.

At round zero every node has the same color. At round one every node still has
the same color, because every node has two neighbors of the same previous
color. Nothing changes at round two, or round three, or at stabilization.

The graph-level readout sees:

```text
six nodes of color 0
```

on both sides.

But the graphs disagree on facts a human would notice instantly:

```text
C6:       0 triangles, 1 component
C3 + C3: 2 triangles, 2 components
```

Now switch to **prism vs K3,3**. This pair removes the cheap objection that
the previous example was disconnected. Both graphs are connected. Both have six
nodes. Both have nine edges. Both are 3-regular. Starting from a single node
feature, every node again receives the same multiset of neighbor colors at
every round.

Still, the triangular prism has two triangles and is not bipartite. `K3,3` has
no triangles and is bipartite.

The path/cycle pair is the control. A path has two degree-one endpoints, while
the cycle does not. 1-WL catches that immediately because the first refinement
is basically a degree histogram when all initial colors are equal.

The relabeled cycle is the other control. Changing node names should not change
the answer, and it does not.

## Why This Is Not Just a Bad Aggregator

Some neural aggregators lose more information than 1-WL.

Mean aggregation can map different multisets to the same average. Max
aggregation can forget multiplicity. Xu et al. make this concrete and argue
for injective multiset aggregation when the goal is maximum discrimination
within the message-passing family.[^xu]

But the lab examples are not failures of mean instead of sum. They are failures
of the whole 1-WL contract.

For `C6` versus `C3 + C3`, even an injective multiset function has no
separating information to inject. Every node in both graphs keeps receiving the
same recursive description:

```text
I am a node whose neighbors are two nodes like me.
```

The statement is true in the cycle. It is also true in each triangle. The local
description never says whether walking forward eventually returns after three
steps, six steps, or inside a different connected component. A finite-depth
message-passing network may sample that neighborhood repeatedly, but the
symmetry of the recursive colors has already collapsed the witnesses.

This is the important distinction:

```text
weak aggregator:      model throws away a multiset difference it was given
1-WL blind spot:      the recursive multisets themselves never differ
```

The first is an architecture bug you might fix with a better aggregator.

The second is a boundary condition.

## The Escape Hatches Change the Problem

There are many ways to beat this lab. None are free.

You can add node features that already break the symmetry. You can give nodes
unique IDs, random features, positional encodings, Laplacian eigenvectors,
short-cycle counts, or other structural features. You can use higher-order
GNNs that pass messages over tuples or subgraphs instead of only over nodes.
Morris et al. take this direction explicitly by connecting GNN expressivity to
1-WL and then developing higher-order models tied to stronger WL variants.[^morris]

Those are legitimate moves. They also change the input contract.

If you add triangle counts as node features, the model can learn from triangle
counts. If you add random identifiers, the model is no longer purely a
permutation-invariant function of an unlabeled graph in the same sense. If you
move to higher-order message passing, the computational object is no longer
just a node state updated from neighboring node states.

This is why "GNNs cannot count triangles" is too sloppy.

A better sentence is:

```text
plain 1-WL-bounded message passing, from identical node labels,
cannot distinguish some graph pairs with different triangle counts
```

That sentence has enough qualifiers to be useful.

## A Practical Debugging Habit

When a graph model succeeds, ask what information contract made success
possible.

```text
What were the initial node and edge labels?
Was the task graph-level, node-level, or pairwise?
How many message-passing rounds were used?
Was aggregation injective over multisets, or mean/max-like?
Were positional encodings or random IDs supplied?
Did the readout pool node states in an injective way?
Is the target property visible to 1-WL, or is a higher-order witness needed?
```

That last question is a good dataset diagnostic. Before training a large GNN,
run a small color-refinement baseline. If 1-WL already separates most labels,
the model may be learning a robust structural signal. If the labels require
triangles, cycles, parity, connectivity, or other witnesses that 1-WL can miss,
then a plain message-passing baseline deserves suspicion before it deserves
more compute.

The theorem does not make graph neural networks small.

It makes one part of their eyesight auditable.

Sometimes the model is not failing to look hard enough.

Sometimes the graph has already forgotten the triangle.

[^gilmer]: Justin Gilmer, Samuel S. Schoenholz, Patrick F. Riley, Oriol Vinyals, and George E. Dahl, ["Neural Message Passing for Quantum Chemistry"](https://proceedings.mlr.press/v70/gilmer17a.html), *Proceedings of Machine Learning Research* 70:1263-1272, 2017.

[^xu]: Keyulu Xu, Weihua Hu, Jure Leskovec, and Stefanie Jegelka, ["How Powerful are Graph Neural Networks?"](https://arxiv.org/abs/1810.00826), ICLR, 2019.

[^morris]: Christopher Morris, Martin Ritzert, Matthias Fey, William L. Hamilton, Jan Eric Lenssen, Gaurav Rattan, and Martin Grohe, ["Weisfeiler and Leman Go Neural: Higher-Order Graph Neural Networks"](https://ojs.aaai.org/index.php/AAAI/article/view/4384), AAAI, 2019.

[^kiefer]: Sandra Kiefer and Brendan D. McKay, ["The Iteration Number of Colour Refinement"](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ICALP.2020.73), ICALP, 2020.
