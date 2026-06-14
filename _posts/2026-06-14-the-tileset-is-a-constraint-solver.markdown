---
layout: post
title: "The Tileset Is A Constraint Solver"
description: "Wave Function Collapse looks like procedural magic, but the useful version is a constraint solver with a texture memory: local patterns, entropy choice, propagation, and restarts."
date: 2026-06-14 16:24:00 -0400
categories: gaming
tags: [wave-function-collapse, procedural-generation, constraint-solving, games, entropy, tilemaps]
excerpt: "A small sample can generate a large map because every output cell is carrying a set of possible local patterns. Collapse one cell, propagate the consequences, and watch the uncertainty drain through the grid."
---

The name is too theatrical.

Wave Function Collapse sounds like physics. In practice, the useful mental model
is simpler and stranger:

```text
every tile is a variable, and every variable starts undecided
```

The algorithm does not dream up a world from nothing. It starts with a small
example, extracts local patches, and says: every location in the new map may be
any patch that appeared in the example. Then it repeatedly makes a small
commitment and deletes every neighboring possibility that can no longer fit.

This is why watching WFC is satisfying. The map does not merely fill in. It
becomes less ambiguous.

## The Trick

Take a tiny sample:

```text
water water shore ground
water shore ground trees
shore ground trees rock
```

Now slide a 3x3 window across it. Each window is a pattern. Two patterns may sit
next to each other only if their overlapping columns or rows agree. A pattern on
the left and a pattern on the right share two columns; if those columns do not
match, the adjacency is illegal.

That is the core of the overlapping Wave Function Collapse model popularized by
Maxim Gumin's implementation.[^gumin] In Gumin's description, the wave starts in
a completely unobserved state, observation chooses a minimal nonzero entropy
element, collapse selects a definite state according to pattern frequencies, and
propagation carries the consequences. If a cell loses every possible state, the
run has contradicted itself.

The word "entropy" is doing practical work here. If one cell has 70 possible
patterns and another has 2, the second cell is more constrained. Collapsing it
first tends to reveal consequences sooner. The algorithm is saying:

```text
choose the place where you know the most
```

That heuristic is not a proof of success. It is a search policy.

## A Small Constraint Lab

The lab below implements an overlapping WFC toy. It extracts all distinct local
patterns from a tiny sample, gives each output cell the full domain of possible
patterns, chooses low-entropy cells, collapses with weighted randomness, and
then runs queue-based propagation.

The default "coast" sample at order 3 extracts 70 distinct 3x3 patterns. On the
default seed, one early attempt contradicts, the next solves the 24x24 field in
16 observations after banning 39,744 pattern states. Those counts are not a
benchmark. They are an autopsy: most of the work is not drawing tiles, it is
deleting impossible worlds.

<style>
  .wfc-lab {
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

  .wfc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .wfc-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .wfc-lab__controls input,
  .wfc-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .wfc-lab__controls select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.36rem 0.45rem;
  }

  .wfc-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .wfc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .wfc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .wfc-lab__metric span,
  .wfc-lab__legend,
  .wfc-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .wfc-lab__metric span {
    display: block;
  }

  .wfc-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .wfc-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .wfc-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .wfc-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .wfc-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .wfc-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .wfc-lab {
      padding: 0.85rem;
    }

    .wfc-lab canvas {
      height: 1060px;
    }
  }
</style>

<div class="wfc-lab" data-wfc-lab>
  <div class="wfc-lab__controls">
    <label>
      Sample <output data-value="sample">coast</output>
      <select data-param="sample" aria-label="Sample">
        <option value="coast" selected>coast</option>
        <option value="rooms">rooms</option>
        <option value="tracks">tracks</option>
      </select>
    </label>
    <label>
      Pattern order <output data-value="order">3</output>
      <input type="range" data-param="order" min="2" max="4" step="1" value="3" aria-label="Pattern order">
    </label>
    <label>
      Output size <output data-value="size">24</output>
      <input type="range" data-param="size" min="14" max="34" step="2" value="24" aria-label="Output size">
    </label>
    <label>
      Sample bias <output data-value="bias">72%</output>
      <input type="range" data-param="bias" min="0" max="100" step="2" value="72" aria-label="Sample bias">
    </label>
    <label>
      Restart budget <output data-value="restarts">8</output>
      <input type="range" data-param="restarts" min="0" max="20" step="1" value="8" aria-label="Restart budget">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="31" aria-label="Seed">
    </label>
  </div>
  <div class="wfc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Wave Function Collapse lab showing the source sample, generated result, remaining choices, and search trace"></canvas>
  <div class="wfc-lab__legend">
    <span><i style="background:#2563eb"></i>Water</span>
    <span><i style="background:#f2cc72"></i>Shore</span>
    <span><i style="background:#9ccf85"></i>Ground</span>
    <span><i style="background:#0f766e"></i>Trees</span>
    <span><i style="background:#334155"></i>Wall</span>
    <span><i style="background:#b45309"></i>Door</span>
  </div>
  <p class="wfc-lab__note">
    This is a deterministic browser experiment, not a production WFC library.
    Solved outputs have every local order-N patch copied from the sample. Partial
    outputs show the best failed attempt after the restart budget is exhausted.
  </p>
</div>

<script defer src="{{ '/assets/js/wfc-constraint-lab.js' | relative_url }}"></script>

Try three things.

First, raise **Pattern order**. Order 2 is permissive: many tiny patches can
coexist, so the generator has room to maneuver. Order 4 remembers larger pieces
of the sample. That can preserve structure, but it also makes the puzzle easier
to overconstrain. The "tracks" sample at order 4 often fails after a few
restarts because a single unlucky commitment can demand an overlap that no
remaining pattern can support.

Second, switch to **rooms**. The algorithm did not receive a dungeon grammar. It
received wall, door, and floor patches. Rooms emerge because every legal patch
must look like something that once appeared near a room.

Third, change **Sample bias**. The lab uses observed pattern counts as weights.
Low bias treats rare and common patches more evenly. High bias makes frequent
patches more likely during collapse. This is a local frequency preference, not a
guarantee that the large output will match the sample distribution exactly.

That distinction matters.

## What Propagation Really Deletes

Suppose cell `A` can still be patterns:

```text
{coast-bend, coast-straight, inland-forest}
```

and its eastern neighbor `B` can still be:

```text
{water-left, forest-left, wall-left}
```

If no surviving pattern in `A` has an eastern overlap that supports
`wall-left`, then `wall-left` is deleted from `B`. If that deletion leaves some
other neighbor unsupported, the deletion continues.

This is the same kind of move as arc consistency in constraint satisfaction:
delete a value from one variable when there is no compatible value left in the
neighboring variable.[^mackworth] Mackworth's AC-3 algorithm is not WFC, but it
is the family resemblance. WFC is a generator built around repeated local domain
pruning.

The key word is **local**.

Every neighboring pair can be legal while the whole map is still impossible to
finish. That is why contradictions and restarts are not implementation
embarrassments. They are part of the search problem. WFC is often fast and
beautiful because the local constraints are informative, not because local
consistency magically becomes global consistency on a grid with loops.

## The Older Name Was More Honest

Paul Merrell's model synthesis work is an important predecessor. It framed the
problem as generating a large model that resembles a smaller example by matching
local structure.[^merrell] Merrell later described WFC as a reimplementation of
model synthesis, with similar algorithmic behavior and a different center of
gravity in 2D texture and tile generation.[^merrell-site]

"Model synthesis" is the plainer name. It says what is happening:

```text
copy local constraints, then search for a larger object that satisfies them
```

The newer name won because it is vivid. The older name explains the engineering
contract.

## Why Game Designers Like It

Procedural content generation in games has a practical tension: designers want
variety, but they also want control. The PCG literature covers many families of
methods - noise, grammars, search, evolutionary methods, planning, answer-set
programming, mixed-initiative tools - because no single generator owns the
space.[^pcgbook]

WFC is appealing because the authoring interface is concrete. A designer can
draw a sample or define a tileset, then let the solver expand it. The sample is
not a prompt. It is a constraint source.

That gives WFC a different feel from many learned generators:

- Invalid adjacency can be impossible, not merely unlikely.
- Style can be edited by changing examples, not retraining a model.
- Failure is visible as a contradiction, not hidden as a bad sample.
- Local validity is cheap to inspect.

The price is that WFC mostly understands local texture. A valid tilemap is not
necessarily a good level. It may have no route, no pacing, no affordance
gradient, no encounter design, no economy, no story beat. For games, WFC is
often strongest as a local constraint engine inside a larger system: combine it
with global reachability checks, designer pins, repair passes, search, or a
separate objective for playability.

## The Generator As A Debuggable Object

The reason I like this algorithm is not that it makes pretty maps. Lots of
things make pretty maps.

I like that it leaves a trace.

The trace tells you where ambiguity vanished, which commitments forced the
largest deletions, and whether a failure came from a tiny sample, a high pattern
order, a biased choice, or an impossible global demand. The generator is not a
black box of vibes. It is a record of disappearing alternatives.

That is a useful lesson beyond tilemaps.

Many creative systems are built by blending two forces:

```text
soft taste about what tends to occur
hard rules about what cannot occur
```

Wave Function Collapse sits unusually close to the hard-rule end. It reminds us
that generation does not always need to begin with a neural prior. Sometimes the
most powerful model is a small example plus the courage to delete everything
that cannot be true.

[^gumin]: Maxim Gumin, ["WaveFunctionCollapse"](https://github.com/mxgmn/WaveFunctionCollapse), first released in 2016. The repository describes the observation, weighted collapse, propagation, and contradiction loop used by the algorithm.

[^mackworth]: A. K. Mackworth, ["Consistency in Networks of Relations"](https://www.cs.ubc.ca/~mack/Publications/AI77.pdf), *Artificial Intelligence*, 1977.

[^merrell]: Paul Merrell, ["Example-Based Model Synthesis"](https://paulmerrell.org/wp-content/uploads/2021/06/model_synthesis.pdf), *Symposium on Interactive 3D Graphics and Games*, 2007.

[^merrell-site]: Paul Merrell, ["Model Synthesis"](https://paulmerrell.org/model-synthesis/), including his comparison of model synthesis and Wave Function Collapse.

[^pcgbook]: Noor Shaker, Julian Togelius, and Mark J. Nelson, ["Procedural Content Generation in Games"](https://www.pcgbook.com/), Springer, 2016.
