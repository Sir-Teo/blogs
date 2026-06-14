---
layout: post
title: "The Cliff Lives at Infinity"
description: "Percolation has a clean infinite-lattice threshold, but every experiment sees a rounded finite box. The browser can show the cliff only by watching the S-curve sharpen."
date: 2026-06-14 16:50:00 -0400
categories: physics
tags: [percolation, critical-phenomena, finite-size-scaling, union-find, statistical-physics, applied-math]
excerpt: "On the infinite square lattice, bond percolation changes at p=1/2. In a finite simulation there is no magic instant, only a crossing probability that steepens as the box grows."
---

There is a cliff you cannot photograph.

Open each edge of an infinite square grid independently with probability \(p\).
At small \(p\), every open component is finite. At large \(p\), with probability
one, some open component wanders forever. The transition is abrupt in the
mathematical object:

```text
below the critical probability: no infinite cluster
above it: an infinite cluster exists almost surely
```

For bond percolation on the square lattice, the critical probability is exactly
\(1/2\). That is the Harris-Kesten theorem: Harris proved the lower half, and
Kesten proved the upper half.[^harris-kesten]

Now try to observe that theorem in a browser.

You cannot draw an infinite grid. You draw a finite \(L \times L\) box and ask a
nearby question: does some open cluster connect the left side to the right side?
The answer is random. At \(p=0.49\), the box may cross. At \(p=0.51\), it may
fail. The theorem has not disappeared. It is being viewed through a finite
window.

The infinite cluster is not a finite object. What the finite experiment sees is
a crossing probability.

## The Medium Is Random, Not the Fluid

Broadbent and Hammersley introduced percolation in their 1957 paper "Crystals
and mazes." Their abstract frames the essential reversal: instead of studying a
randomly moving fluid in a fixed medium, study how randomness in the medium
itself controls whether passage is possible.[^broadbent]

The model is almost offensively simple.

In **bond percolation**, every edge is open with probability \(p\). Clusters are
connected sets of vertices joined by open edges.

In **site percolation**, every vertex is occupied with probability \(p\).
Clusters are connected occupied vertices.

No forces. No energy. No geometry beyond adjacency. Yet the model has a phase
transition, scaling laws, fractal critical clusters, and a surprisingly rich
boundary between local disorder and global connectivity. Stauffer's review
uses percolation as an entry point into the scaling theory of critical
phenomena precisely because the model is so stripped down.[^stauffer]

That austerity is useful. It lets us ask:

```text
when does local randomness create a macroscopic route?
```

The answer depends on the lattice and on whether we open sites or bonds. On the
square lattice, bond percolation has the exact threshold \(p_c = 1/2\). Square
site percolation does not share that exact self-dual value; high-precision
simulation by Newman and Ziff estimated \(p_c = 0.59274621(13)\).[^newman-ziff]

Same square grid. Different microscopic object. Different threshold.

## The Half Is Not Just Symmetry

The seductive proof sketch for \(p_c=1/2\) is planar duality.

Draw the dual grid by placing a vertex in every face of the square lattice.
Every primal edge has a dual edge crossing it. If a primal edge is closed, call
the corresponding dual edge open. A left-right open crossing of a rectangle and
a top-bottom closed dual crossing obstruct one another. In a square lattice,
the dual graph has the same shape as the original graph, shifted by half a
cell.

So \(1/2\) is the obvious guess.

It is not the theorem.

Self-duality explains why the answer should be balanced. It does not by itself
prove that a cluster reaches infinity for every \(p>1/2\), nor that it fails at
and below the critical point. The real proof needs sharp crossing estimates and
renormalization ideas. Bollobas and Riordan's short proof is still a serious
paper because the intuitive picture has to be turned into a statement about
arbitrarily large rectangles and, finally, the infinite lattice.[^harris-kesten]

This is the first moral:

```text
the threshold is a thermodynamic-limit statement, not a single finite picture
```

Finite pictures are still valuable. They are how we learn to see the theorem.

## A Box That Can Only Estimate

The lab below runs small Monte Carlo experiments for square-lattice bond and
site percolation. It uses union-find to maintain connected components. For each
trial, it opens edges or sites independently, unions adjacent open pieces, and
records whether any component touches both the left and right boundary.

This is not the full Newman-Ziff single-run estimator, which can measure many
occupation probabilities from one randomized ordering. It is deliberately more
literal: sweep \(p\), repeat trials, estimate the crossing curve. The algorithmic
core is the same simple component bookkeeping.

The default bond setting uses \(L=36\), \(p=0.50\), and 140 trials. On my run,
the estimated left-right crossing probability was about 54%, the estimated
median crossing point was about 0.494, and the 25%-to-75% transition width was
about 0.043. Switch to site mode and the corresponding median moves near
0.590, close to the known square-site value \(0.592746\).

The exact numbers will move with seed and trial count. The shape should not.

<style>
  .perc-lab {
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

  .perc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .perc-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .perc-lab__controls input,
  .perc-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .perc-lab__controls select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.36rem 0.45rem;
  }

  .perc-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .perc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .perc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .perc-lab__metric span,
  .perc-lab__legend,
  .perc-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .perc-lab__metric span {
    display: block;
  }

  .perc-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .perc-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 760px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .perc-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .perc-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .perc-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .perc-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .perc-lab {
      padding: 0.85rem;
    }

    .perc-lab__controls {
      grid-template-columns: 1fr;
    }

    .perc-lab canvas {
      height: 1120px;
    }
  }
</style>

<div class="perc-lab" data-percolation-lab>
  <div class="perc-lab__controls">
    <label>
      Model <output data-value="model">bond percolation</output>
      <select data-param="model" aria-label="Percolation model">
        <option value="bond" selected>bond percolation</option>
        <option value="site">site percolation</option>
      </select>
    </label>
    <label>
      Occupation probability <output data-value="p">0.500</output>
      <input type="range" data-param="p" min="5" max="95" step="1" value="50" aria-label="Occupation probability">
    </label>
    <label>
      Lattice size <output data-value="size">36</output>
      <input type="range" data-param="size" min="12" max="64" step="1" value="36" aria-label="Lattice size">
    </label>
    <label>
      Trials per point <output data-value="trials">140</output>
      <input type="range" data-param="trials" min="30" max="260" step="10" value="140" aria-label="Trials per probability">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="37" aria-label="Random seed">
    </label>
  </div>
  <div class="perc-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Percolation threshold lab showing clusters, crossing probability, finite-size sharpening, and ranked cluster sizes"></canvas>
  <div class="perc-lab__legend">
    <span><i style="background:#0f766e"></i> spanning cluster</span>
    <span><i style="background:#2563eb"></i> crossing curve</span>
    <span><i style="background:#be123c"></i> known threshold</span>
    <span><i style="background:#b45309"></i> selected p</span>
  </div>
  <p class="perc-lab__note">
    The lab estimates finite-box left-right crossing probabilities. Bond mode
    compares against the exact square-lattice threshold 1/2. Site mode compares
    against the high-precision square-site estimate 0.592746.
  </p>
</div>

<script defer src="{{ '/assets/js/percolation-threshold-lab.js' | relative_url }}"></script>

Try three things.

First, drag \(p\) below and above \(1/2\) in bond mode. The drawn sample changes
from dust, to a tangled critical-looking object, to a system dominated by a
giant connected component.

Second, increase \(L\). The crossing probability curve becomes steeper. It does
not become perfectly vertical on the page, because the page is still finite.
But the transition width shrinks. That is finite-size scaling in a form you can
see.

Third, switch from bond to site percolation. The picture still feels like
percolation, but the threshold moves. The exact half belonged to a particular
duality structure, not to "squareness" in the everyday sense.

## How a Rounded S Becomes a Cliff

Away from the critical point, percolation has a length scale. Below \(p_c\),
finite clusters have a typical diameter. Above \(p_c\), the infinite cluster
exists, but finite holes and dangling structures still have characteristic
scales. Near \(p_c\), the correlation length grows.

The scaling story says, roughly,

$$
\xi(p) \sim |p-p_c|^{-\nu}.
$$

For two-dimensional percolation, the exponent is \(\nu=4/3\).[^stauffer]

A finite \(L \times L\) experiment cannot distinguish "truly infinite" from
"larger than my window." The crossing probability changes rapidly when
\(\xi(p)\) is comparable to \(L\). As \(L\) grows, the interval of \(p\) values
where that comparison is ambiguous narrows.

This is why finite-size plots often show a family of S-curves, not a step
function. The step function is the limit. The curves are the data.

The browser lab estimates a crude transition width by finding where the
left-right crossing probability moves from 25% to 75%. For the default bond run,
that width is roughly 0.064 for \(L=21\), 0.051 for \(L=36\), and 0.042 for
\(L=51\). The estimates are noisy, but the direction is the point:

```text
larger finite systems behave more like the infinite theorem
```

The theorem is not what a finite simulation outputs. The theorem is what the
finite simulation is converging toward.

## Union-Find Turns Pictures Into Invariants

Union-find is the right little machine for this experiment because percolation
is a connectivity problem.

For bond percolation:

```text
make every vertex its own component
for each edge:
  if the edge is open:
    union the two endpoint components
```

For site percolation:

```text
activate occupied vertices
for each occupied vertex:
  union it with occupied north/west neighbors
```

Each component stores four boundary bits: touches left, right, top, bottom. A
left-right crossing exists as soon as some component has both the left and right
bits. A top-bottom crossing is the analogous vertical event.

This turns a visual question into a small data structure invariant:

```text
cluster spans horizontally iff flags(root) contains LEFT and RIGHT
```

Newman and Ziff's more powerful algorithm asks a better Monte Carlo question.
Instead of rerunning a fresh experiment at every \(p\), randomize an ordering of
sites or bonds, add them one by one, update clusters with union-find, and then
use binomial weights to recover observables across the whole range of \(p\).
Their paper reports linear scaling in system size for estimating quantities such
as spanning probability across occupation probabilities.[^newman-ziff-fast]

The page here chooses clarity over that acceleration. Still, the conceptual
move is the same: once random geometry becomes connectivity bookkeeping, a
phase transition becomes something you can measure by maintaining components.

## Be Careful With "Critical"

It is tempting to point at a finite picture and say:

```text
this sample is critical
```

That is not quite right. A single finite sample at \(p=0.5\) is not the
critical point. It is one draw from a finite ensemble near the infinite
critical point. It may cross or not cross. It may look sparse or surprisingly
connected. Its largest cluster is a statistic, not a theorem.

Criticality lives in limits:

```text
increase L
average over samples
approach p_c
watch scale stop being local
```

This is not pedantry. It is the difference between a beautiful image and a
claim. Many applied systems borrow the language of phase transitions: neural
network grokking, market cascades, epidemic thresholds, game network effects,
infrastructure fragility. Sometimes the analogy is useful. Sometimes it is only
a metaphor in a lab coat.

Percolation is a good discipline because it makes the bookkeeping explicit.
What is the order parameter? What is the limiting object? What is finite-size
rounding? What is the sample-to-sample variability? What exact theorem, if any,
are we leaning on?

The square lattice gives a gift: one version has the clean answer \(1/2\). But
the gift is also a warning. Change bonds to sites and the half vanishes. Keep
the same \(p\) but change the finite window and the measured crossing
probability changes. Look at one sample and the theorem is hidden under chance.

The phase transition is real.

The finite picture is a mirage with a ruler attached.

[^broadbent]: S. R. Broadbent and J. M. Hammersley, ["Percolation processes. I. Crystals and mazes"](https://www.cambridge.org/core/journals/mathematical-proceedings-of-the-cambridge-philosophical-society/article/percolation-processes/C00CC4943F48228F8AC8031092FE84EC), *Proceedings of the Cambridge Philosophical Society*, 1957.

[^harris-kesten]: Bela Bollobas and Oliver Riordan, ["A short proof of the Harris-Kesten Theorem"](https://arxiv.org/abs/math/0410359), *Bulletin of the London Mathematical Society*, 2006. The original upper-bound theorem is Harry Kesten, ["The critical probability of bond percolation on the square lattice equals 1/2"](https://projecteuclid.org/journals/communications-in-mathematical-physics/volume-74/issue-1/The-critical-probability-of-bond-percolation-on-the-square/cmp/1103907931.pdf), *Communications in Mathematical Physics*, 1980.

[^newman-ziff]: M. E. J. Newman and R. M. Ziff, ["Efficient Monte Carlo algorithm and high-precision results for percolation"](https://arxiv.org/abs/cond-mat/0005264), *Physical Review Letters*, 2000.

[^newman-ziff-fast]: M. E. J. Newman and R. M. Ziff, ["A fast Monte Carlo algorithm for site or bond percolation"](https://arxiv.org/abs/cond-mat/0101295), *Physical Review E*, 2001.

[^stauffer]: Dietrich Stauffer, ["Scaling theory of percolation clusters"](https://ui.adsabs.harvard.edu/abs/1979PhR....54....1S/abstract), *Physics Reports*, 1979.
