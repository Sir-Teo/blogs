---
layout: post
title: "The Cut Survives The Contractions"
description: "Karger's min-cut algorithm is a small Monte Carlo argument: a minimum cut is found if none of its edges are contracted. A brute-force oracle and simulator make the survival proof visible."
date: 2026-06-18 10:10:00 -0400
categories: computer-science
tags: [karger-algorithm, min-cut, randomized-algorithms, graph-algorithms, monte-carlo, algorithms]
excerpt: "Random contraction looks reckless until you track one named minimum cut. Every safe contraction shrinks the graph without touching that cut; repetition turns the fragile survival event into an algorithm."
---

Some algorithms find a certificate by building it.

Karger's contraction algorithm finds one by trying not to destroy it.

The problem is the **global** minimum cut of an undirected graph: split the
vertices into two nonempty sides while minimizing the number, or total weight,
of crossing edges. There is no distinguished source or sink. This is not the
same posture as an `s-t` max-flow computation. We are asking where the whole
graph is easiest to disconnect.

The random contraction algorithm is almost suspiciously short:

```text
while more than two supernodes remain:
    choose a remaining edge uniformly at random
    contract its endpoints
    delete self-loops, keep parallel edges
return the cut between the two final supernodes
```

The trick is not that one trial is reliable. It is not. The trick is that a
particular minimum cut has a quantifiable chance to survive, and independent
repetition is cheap to reason about.

## The Event Is Survival

Fix one minimum cut $$C$$ with $$\lambda$$ crossing edges.

If the algorithm never contracts an edge of $$C$$, then the two sides of $$C$$
are never merged together. Other contractions can collapse vertices inside each
side, but they cannot erase the border. When only two supernodes remain, those
supernodes must be exactly the two sides of the fixed cut, up to renaming.

So the success event for this fixed cut is:

```text
no edge of C is ever selected for contraction
```

Karger's proof prices that event one contraction at a time.[^karger-mincut]
Suppose the current contracted graph has $$r$$ supernodes and the original cut
has survived so far. Contracting vertices only restricts the set of cuts still
available, so the current graph's min-cut is at least $$\lambda$$. Therefore
every supernode has degree at least $$\lambda$$, and the current multigraph has
at least $$r\lambda/2$$ edges.

Only $$\lambda$$ of those edges cross our fixed cut. Thus the probability that
the next random edge kills this cut is at most:

$$
\frac{\lambda}{r\lambda/2}=\frac{2}{r}.
$$

The survival probability is at least:

$$
\prod_{r=n}^{3}\left(1-\frac{2}{r}\right)
=
\frac{2}{n(n-1)}
=
\frac{1}{\binom{n}{2}}.
$$

That number is small. For $$n=100$$ it is about `0.0202%` for one named cut in
one run. But it is not astronomically small, and it has no hidden dependence on
the number of edges. After $$T$$ independent runs, the probability of missing
that same fixed cut is at most:

$$
\left(1-\frac{2}{n(n-1)}\right)^T.
$$

That is the entire shape of the algorithm: a bad one-shot gamble with a clean
lower bound becomes useful when repeated.

## Lab: Let The Cut Try To Survive

The lab below builds small unweighted multigraphs, computes the exact global
min cut by brute force, then runs repeated random contractions against that
oracle.

The default graph is two `K5` cliques joined by two parallel bridge edges. Its
minimum cut is unique: separate the cliques by cutting the two bridge copies.
The exact oracle enumerates `511` nonempty cuts, because it fixes one vertex on
the complement side to avoid counting each cut twice.

Default run:

| Quantity | Value |
| --- | ---: |
| Vertices | `10` |
| Edge copies | `22` |
| Exact min-cut value | `2` |
| Canonical min cuts | `1` |
| Random contraction trials | `240` |
| Optimal returned cuts | `73` |
| Observed optimal rate | `30.4%` |
| First optimal trial | `13` |
| One-fixed-cut lower bound | `2.22%` |
| Repetitions for 95% fixed-cut success | `134` |

The observed rate is much better than the proof bound on this graph. That is
normal. The proof is worst-case and follows one named cut. The cycle preset is
the opposite lesson: a ten-cycle has `45` canonical minimum cuts, and every
contraction result is optimal, even though any one fixed cut still has only the
Karger lower-bound chance.

<style>
  .karger-lab {
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
  .karger-lab *,
  .karger-lab *::before,
  .karger-lab *::after {
    box-sizing: border-box;
  }
  .karger-lab__controls {
    display: grid;
    gap: 0.8rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }
  .karger-lab label {
    color: #39444e;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }
  .karger-lab input,
  .karger-lab select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }
  .karger-lab select {
    padding: 0.35rem 0.45rem;
  }
  .karger-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }
  .karger-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 1rem;
  }
  .karger-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    min-height: 4rem;
    padding: 0.55rem 0.65rem;
  }
  .karger-lab__metric.good {
    border-color: #9ed8c5;
  }
  .karger-lab__metric.bad {
    border-color: #f2b8c4;
  }
  .karger-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .karger-lab__metric strong {
    color: #172026;
    display: block;
    font-size: clamp(0.95rem, 2vw, 1.18rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.2rem;
    overflow-wrap: anywhere;
  }
  .karger-lab canvas {
    aspect-ratio: 920 / 680;
    border: 1px solid #e3e9f0;
    border-radius: 8px;
    display: block;
    max-width: 100%;
    width: 100%;
  }
  .karger-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    line-height: 1.55;
    margin: 0.85rem 0 0;
  }
  @media (max-width: 620px) {
    .karger-lab {
      padding: 0.8rem;
    }
    .karger-lab canvas {
      aspect-ratio: 390 / 980;
    }
  }
</style>

<div class="karger-lab" data-karger-mincut-lab>
  <div class="karger-lab__controls">
    <label>
      Graph <output data-value="graph">two cliques, two bridges</output>
      <select data-param="graph" aria-label="Graph preset">
        <option value="bridge" selected>two cliques, two bridges</option>
        <option value="cycle">cycle, many min cuts</option>
        <option value="islands">three islands</option>
        <option value="ladder">ladder</option>
      </select>
    </label>
    <label>
      Trials <output data-value="trials">240</output>
      <input data-param="trials" type="range" min="20" max="800" step="20" value="240" aria-label="Random contraction trials">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input data-param="seed" type="range" min="1" max="997" step="1" value="37" aria-label="Random seed">
    </label>
    <label>
      Shown trial <output data-value="trace">7</output>
      <input data-param="trace" type="range" min="1" max="80" step="1" value="7" aria-label="Trace trial">
    </label>
  </div>
  <div class="karger-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Karger random contraction min-cut lab with exact oracle, one contraction trace, outcome histogram, and repetition bound"></canvas>
  <p class="karger-lab__note" data-note>
    Loading random contraction experiment.
  </p>
</div>

<script defer src="{{ '/assets/js/karger-mincut-lab.js?v=20260618a' | relative_url }}"></script>

The audit exported by the script runs 183 checks:

```javascript
const lab = require("./assets/js/karger-mincut-lab.js");
const audit = lab.auditKargerMincutLab();
if (!audit.passed) throw new Error("audit failed");
```

It verifies the brute-force oracle on every preset, checks that random
contraction never returns a cut below the oracle, checks that fixed-cut survival
implies an optimal result, confirms that the ten-cycle always returns a min
cut, and runs a 48-case grid over graph presets, seeds, and trial counts.

## Keep The Parallel Edges

The line "delete self-loops, keep parallel edges" is not a programming detail.
It is the distribution.

If two supernodes have five original edges between them, there should be five
ways for the next random edge to choose that pair. Collapsing those five edges
into one unweighted edge changes the algorithm. The lab stores parallel edges
as separate edge copies for exactly this reason.

The same point explains weighted graphs. Karger's original paper presents the
algorithm for weighted undirected graphs too; integer weights can be viewed as
parallel edge copies, and the paper discusses how to avoid making the runtime
depend on the numeric sum of weights.[^karger-mincut] The browser lab stays
small and integer because it also carries a brute-force exact oracle.

## Why This Is Not A Max-Flow Story

Max-flow/min-cut proves optimality through a residual graph and a reachable set.
Random contraction proves success by conditioning on a cut not being touched.

Both stories end with a cut, but the evidence is different.

For max-flow, the certificate is:

```text
no residual path remains, and the reachable side has capacity equal to the flow
```

For random contraction, one successful trial's certificate is weaker unless we
also verify the cut value. The algorithm is Monte Carlo: it has a fixed running
plan, and a single run can miss. The standard way to use it is to repeat trials
and keep the smallest cut seen. In a production implementation, one would often
pair that repeated randomized search with a deterministic or independently
checked certificate when exactness matters.

This is why the lab includes the exact oracle even though it is exponential. It
lets the small experiment say something honest:

```text
the randomized algorithm returned value 2
the exhaustive oracle says no cut has value below 2
```

For larger graphs, that oracle is gone. The proof bound is what remains.

## Karger-Stein As A Recursion Hint

The basic contraction algorithm repeats all the way down to two supernodes.
Karger and Stein's later algorithm changes the shape: contract partway, branch,
and recurse, exploiting the fact that a minimum cut is a small fraction of the
edges while avoiding some wasted full descents.[^karger-stein] Their JACM paper
gave a randomized strongly polynomial algorithm for weighted undirected min cut
with high probability in `O(n^2 log^3 n)` time.

The lab does not implement that recursive version. It stays with the tiny
algorithm because the survival event is visible. But the recursive improvement
has the same soul: contract aggressively while the fixed cut is unlikely to be
hit, then spend branching only when the graph is smaller.

## Evidence, Interpretation, Speculation

**Evidence.** Karger's 1992/1993 contraction paper defines the random
contraction algorithm, proves the fixed minimum-cut survival bound
`1 / binom(n, 2)`, and derives the repeated-trial high-probability result.
Karger and Stein later improved the approach with recursive contraction and a
faster high-probability algorithm for weighted undirected graphs.

**Interpretation.** The algorithm is best understood as survival analysis for a
certificate that already exists. Randomness is not searching uniformly over all
cuts. It is sampling contraction histories, and a good history is one that
never touches the cut we care about.

**Speculation.** Random contraction is a useful antidote to a common engineering
instinct: do not assume that a randomized algorithm is mysterious because its
steps are locally reckless. Sometimes the right proof object is the event that
the reckless step avoided one small forbidden set.

[^karger-mincut]: David R. Karger, [Global Min-cuts in RNC, and Other Ramifications of a Simple Min-Cut Algorithm](https://people.csail.mit.edu/karger/Papers/mincut.pdf), October 30, 1992; SODA 1993 version listed on [Karger's publications page](https://people.csail.mit.edu/karger/papers.html). Section 2 gives the contraction algorithm, the fixed min-cut survival theorem, and the `O(n^2 log n)` independent-repetition corollary.

[^karger-stein]: David R. Karger and Clifford Stein, [A New Approach to the Minimum Cut Problem](https://people.csail.mit.edu/karger/Papers/fastcut.pdf), preliminary STOC 1993 version and Journal of the ACM 43(4), 1996. Karger's publications page lists the JACM version and summarizes the `O(n^2 log^3 n)` high-probability bound for weighted undirected graphs.
