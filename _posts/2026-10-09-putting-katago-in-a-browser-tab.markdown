---
layout: post
title: "Putting KataGo in a browser tab"
description: >-
  How web-katrain runs KataGo's neural network and Monte Carlo tree search
  inside a browser tab, verified against the native C++ engine and explored
  through interactive figures built from its own code.
date: 2026-10-09 10:00:00 -0400
excerpt: >-
  Running KataGo's neural network and tree search inside a browser tab with no
  server behind it—how the worker boundary, backend fallbacks, golden tests,
  PUCT search, and territory swing map fit together.
links:
  - title: Live app
    url: https://sir-teo.github.io/web-katrain/
  - title: Source
    url: https://github.com/Sir-Teo/web-katrain
styles:
  - /assets/css/web-katrain.css
scripts:
  - /assets/js/web-katrain.js
---

Reviewing a game of Go with an engine usually starts with system administration: downloading KataGo, matching an OpenCL or CUDA binary to your GPU, and wiring a desktop client like KaTrain or Lizzie to a local process. **web-katrain** puts that entire loop—neural network inference, Monte Carlo tree search, and KaTrain-style game review—inside a single browser tab, with no server behind it. Every number in the interactive figures below comes straight out of its engine code, evaluated with the weights the app bundles.

## Main thread and worker

<figure class="fig">
<svg class="arch" viewBox="0 0 680 296" role="img" aria-label="Architecture: the main thread holds the React components, game store, analysis queue and engine client; a Web Worker holds the message handler, MCTS search, input features and the TensorFlow.js network; the two exchange messages with postMessage.">
<defs>
<marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head" d="M0,1 L9,5 L0,9 z"/></marker>
<marker id="arch-arrow-strong" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<text class="lbl" x="24" y="13">Main thread</text>
<text class="lbl" x="376" y="13">Web Worker</text>
<rect class="box" x="24" y="26" width="280" height="42" rx="6"/>
<text class="t" x="164" y="40">React components</text>
<text class="st" x="164" y="56">board, move tree, graph, panels</text>
<rect class="box" x="24" y="82" width="280" height="42" rx="6"/>
<text class="t" x="164" y="96">Game store (Zustand)</text>
<text class="st" x="164" y="112">game tree, settings, analysis per node</text>
<rect class="box" x="24" y="138" width="280" height="42" rx="6"/>
<text class="t" x="164" y="152">Analysis queue</text>
<text class="st" x="164" y="168">priority, cancellation, stale check, cache</text>
<rect class="box" x="24" y="194" width="280" height="42" rx="6"/>
<text class="t" x="164" y="208">Engine client</text>
<text class="st" x="164" y="224">promises over messages</text>
<rect class="box" x="376" y="26" width="280" height="42" rx="6"/>
<text class="t" x="516" y="40">TensorFlow.js network</text>
<text class="st" x="516" y="56">WebGPU, then WASM, then CPU</text>
<rect class="box" x="376" y="82" width="280" height="42" rx="6"/>
<text class="t" x="516" y="96">Input features</text>
<text class="st" x="516" y="112">22 board planes and 19 globals</text>
<rect class="box" x="376" y="138" width="280" height="42" rx="6"/>
<text class="t" x="516" y="152">MCTS search</text>
<text class="st" x="516" y="168">KataGo-style PUCT, batched leaves</text>
<rect class="box" x="376" y="194" width="280" height="42" rx="6"/>
<text class="t" x="516" y="208">Message handler</text>
<text class="st" x="516" y="224">serial request queue, model cache</text>
<path class="edge" d="M164 68 V80" marker-end="url(#arch-arrow)"/>
<path class="edge" d="M164 124 V136" marker-end="url(#arch-arrow)"/>
<path class="edge" d="M164 180 V192" marker-end="url(#arch-arrow)"/>
<path class="edge" d="M516 194 V182" marker-end="url(#arch-arrow)"/>
<path class="edge" d="M516 138 V126" marker-end="url(#arch-arrow)"/>
<path class="edge" d="M516 82 V70" marker-end="url(#arch-arrow)"/>
<path class="edge-strong" d="M306 215 H374" marker-start="url(#arch-arrow-strong)" marker-end="url(#arch-arrow-strong)"/>
<text class="el" x="340" y="207" style="font-size:9.5px">postMessage</text>
<rect class="box" x="24" y="252" width="632" height="42" rx="6"/>
<text class="t" x="340" y="266">Browser storage only</text>
<text class="st" x="340" y="282">localStorage: settings, auto-save · IndexedDB: game library, uploaded models · Cache Storage: offline app</text>
</svg>
<figcaption>Everything slow lives in the worker. Components only talk to the store, and only the store knows an engine exists.</figcaption>
</figure>

The most important architectural line in the codebase separates the UI from the engine. A 200-visit search can take a couple of seconds; if tensor allocations or tree walks happened on the main thread, stones would stutter under your cursor. Instead, the main thread owns only what you see and touch—the React views and a single Zustand store holding the game tree—while a dedicated Web Worker owns model parsing, feature encoding, neural network inference, and tree search.

Keeping that boundary clean comes down to the analysis queue in the middle. When you scrub rapidly through a game, you do not want forty stale board positions piling up in the worker. The queue orders every request by priority—the position currently on screen comes first, then the AI opponent's next reply, and finally any background full-game review. As soon as you step to a new move, in-flight requests for the old position are cancelled, and completed evaluations are cached directly on their `GameNode` in the tree so revisiting a branch is instant.

## Which backend

<figure class="fig" id="wk-env">
<figcaption>The backend web-katrain would pick in this browser, from the same feature tests the app runs.</figcaption>
</figure>

A browser cannot execute KataGo's native binary directly, so web-katrain reads KataGo's raw `.bin` weight files (format versions 8 through 16), reconstructs the residual network out of TensorFlow.js operations, and feeds it the exact same inputs: 22 spatial planes over the board (stones, liberties, ko bans, ladders, and the last five moves) plus 19 global scalars for komi and rules.

At startup, the app probes your browser to pick the fastest execution path: WebGPU first, then WebAssembly, and finally plain JavaScript on the CPU. Every fallback exists because browsers fail in quiet, specific ways. Multithreaded WASM requires `SharedArrayBuffer`, which browsers only expose when a host sends cross-origin isolation headers—headers that GitHub Pages cannot attach on its own, forcing WASM onto a single thread there. WebGPU needs no special headers and handles most modern desktops, but its shader warm-up can still fail on quirky drivers, and browser storage throws in private windows. Each failure degrades to a slower path rather than breaking the app.

## Checking against KataGo

<figure class="fig" id="wk-golden" style="--reserve: 330px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's golden test position (5×5, White to play, komi 7.5), read by the KataGo binary and by web-katrain with the same network. The board opens on the difference between the two.</figcaption>
</figure>

The bugs to fear in a neural-network port never crash the page. A transposed feature plane, a flipped sign on komi, or an off-by-one liberty count simply makes the engine play slightly worse Go while every number on screen still looks plausible.

To catch silent drift, web-katrain tests itself against KataGo's own golden fixture, which records what the native C++ binary outputs on a 5×5 position using `g170-b6c96`, the compact 3.6 MB network bundled with the app. Pushing that exact position through web-katrain's binary parser, feature encoder, TensorFlow.js graph, and post-processing produces an almost identical reading: across the board, <a class="act" href="#wk-golden" data-layer="ownership" data-source="gap">only four ownership values</a> differ, each by a single permille (`0.001`), while <a class="act" href="#wk-golden" data-layer="policy" data-source="gap">the policy priors</a> match to the printed digit.

Because a single fixture only pins down one board, a companion test suite checks invariants that must hold on *any* position: swapping Black and White stones while negating komi must yield a bit-identical input tensor; raising komi must monotonically lower Black's lead; and under area scoring, summing the ownership map across all intersections must reconcile with the value head's reported score lead. Even board symmetry needed care: KataGo normally evaluates random rotations and reflections to decorrelate errors deep in the search tree, but at the root node that randomness caused the territory overlay to flicker by up to a quarter point from run to run, so root evaluations now lock to a canonical orientation.

## Where the next playout goes

<figure class="fig" id="wk-puct" style="--reserve: 400px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's selection rule on the six candidates after move 20 of the game below, with their real network priors. The blue ticks are the full 200-visit search.</figcaption>
</figure>

```ts
const explore = (scaling * prior) / (1.0 + childWeight);
const score = explore + sign * childUtility; // the best score gets the playout
```

A single network evaluation gives only a first impression: a *policy* prior (where a strong player would look first) and a *value* estimate (who appears to be ahead). Search turns that intuition into calculation by spending *playouts*, walking down the tree one evaluation at a time. At every node, KataGo's PUCT formula adds an exploration bonus—scaled by the network's prior and divided by the weight already spent on that child—to the move's observed utility.

You can watch that balance shift after move 20 of the self-play game below. <a class="act" href="#wk-puct" data-c="1" data-playouts="100">At the default constant</a>, the network's initial favourite, F6, gets the first playout, comes back worse than its prior promised, and quickly cedes the search to H4, which takes 89 of the first 100 playouts. <a class="act" href="#wk-puct" data-c="0.1" data-playouts="100">With less exploration</a>, the search locks onto the early leader even harder; <a class="act" href="#wk-puct" data-c="4" data-playouts="100">with more</a>, the prior keeps pulling visits back toward F6, which climbs to 26. Around this core rule, the port brings over the rest of KataGo's search details: first-play urgency for unvisited moves, lower-confidence-bound move selection, root symmetry deduplication, subtree value-bias correction, and uncertainty-weighted visits.

## Reviewing a game

<figure class="fig wide" id="wk-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>A 9×9 game the bundled network played against itself, every position searched at 200 visits. It opens on move 37 with the swing overlay: ownership after the move minus ownership before, for changes of a quarter point or more.</figcaption>
</figure>

Once every position in a game has been searched, each move is graded by the points of score lead it gave up, following KaTrain's six classes from <span class="swatch" style="--c: rgb(114, 33, 107)"></span>blunder (12 or more points lost) down to <span class="swatch" style="--c: rgb(30, 150, 0)"></span>best (under 0.5). To give the review above genuine mistakes to catch, the self-play generator occasionally planted a lower-ranked candidate instead of the search's top choice; the figure labels those slips on the graph.

A candidate table can tell you *that* a move lost fourteen points, but not *where* on the board those points went. That is what the swing overlay solves. Because the network predicts ownership for every intersection, subtracting the ownership map before a move from the map after it highlights the exact territory that changed hands. On <a class="act" href="#wk-review" data-move="37" data-overlay="swing">Move 37</a>, Black's planted slip at J3 drops 14 points: the swing map immediately shows 15 points in the top right passing to White while 12 points on the left solidify for Black.

Two small constraints make that overlay readable. Subtracting two whole-board estimates leaves a faint haze of tiny deltas across three-quarters of the board, so only intersections that shifted by at least a quarter point (`0.25`) are painted. And the overlay deliberately prints no point total of its own: ownership and score lead come from different heads of the network, and on this small bundled net their changes disagree by 8 to 25 points. The score readout tells you *how much* a move cost; the swing map shows you *where*.
