---
layout: post
title: "Putting KataGo in a browser tab"
series: engines
description: >-
  How web-katrain runs KataGo's neural network and Monte Carlo tree search
  inside a browser tab, verified against the native C++ engine and explored
  through interactive figures built from its own code.
image: /assets/social/putting-katago-in-a-browser-tab.png
date: 2026-10-09 10:00:00 -0400
excerpt: >-
  KataGo's network and tree search, running in a browser tab with nothing to
  install. The hard part is knowing the port is right, because a bug in a
  neural-network port doesn't crash. It just plays slightly worse Go.
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

Reviewing a game of Go with an engine usually starts with system administration: download KataGo, match an OpenCL or CUDA build to your GPU, then wire a desktop client like KaTrain or Lizzie to a local process. **web-katrain** puts that whole loop (the neural network, the Monte Carlo tree search, and KaTrain-style game review) inside one browser tab, with no server behind it.

Running a network in a tab is the easier half. The bugs to fear in a port like this never crash the page. A transposed input plane or a flipped sign on komi just makes the engine play slightly worse Go, while every number on screen still looks plausible. So most of this post is about how the port stays honest. Every number in the figures comes from the app's engine code, run with the weights it bundles.

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

A 200-visit search can take a couple of seconds. If tensor allocations or tree walks ran on the main thread, stones would stutter under your cursor. So the main thread owns only what you see and touch: the React views and one Zustand store holding the game tree. A dedicated Web Worker owns everything slow: parsing the model, encoding the board, running the network, and searching.

What keeps that boundary clean is the analysis queue between them. Scrub quickly through a game and you don't want forty stale positions piling up in the worker. The queue orders requests by priority: the position on screen first, then the AI opponent's next reply, then any background review. Step to a new move and requests for the old one are cancelled. Finished evaluations are cached on their `GameNode`, so going back to a branch is instant.

## Which backend

<figure class="fig" id="wk-env">
<figcaption>The backend web-katrain would pick in this browser, from the same feature tests the app runs.</figcaption>
</figure>

A browser can't run KataGo's native binary, so web-katrain reads KataGo's raw `.bin` weight files (format versions 8 through 16), rebuilds the residual network from TensorFlow.js operations, and feeds it the same inputs KataGo uses: 22 planes over the board (stones, liberties, ko bans, ladders, the last five moves) plus 19 global values such as komi and the rules.

At startup the app probes the browser and takes the fastest path it can: WebGPU, then WebAssembly, then plain JavaScript. Each fallback exists because browsers fail in quiet, specific ways. Multithreaded WebAssembly needs `SharedArrayBuffer`, which browsers only expose when the host sends two cross-origin isolation headers. GitHub Pages can't send them, so WebAssembly runs on one thread there. WebGPU needs no special headers and covers most recent desktops, but its shader warm-up can fail on unusual drivers, and browser storage throws in private windows. Every one of those failures drops to a slower path instead of breaking the app.

## Checking against KataGo

<figure class="fig" id="wk-golden" style="--reserve: 330px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's golden test position (5×5, White to play, komi 7.5), read by the KataGo binary and by web-katrain with the same network. The board opens on the difference between the two.</figcaption>
</figure>

KataGo ships a golden test: a 5×5 position, together with what the native C++ binary outputs for it using `g170-b6c96`, the compact 3.6 MB network web-katrain also bundles. Push that position through web-katrain's parser, feature encoder, TensorFlow.js graph, and post-processing, and the reading comes out almost identical. <a class="act" href="#wk-golden" data-layer="ownership" data-source="gap">Only four ownership values</a> differ, each by one thousandth, and <a class="act" href="#wk-golden" data-layer="policy" data-source="gap">the policy priors</a> match to the last printed digit.

One fixture pins down one board. A second set of tests checks rules that must hold on *any* position. Swapping Black and White while negating komi must produce a bit-identical input. Raising komi must lower Black's lead. And under area scoring, the ownership map summed over the board must agree with the score the value head reports.

Even symmetry needed care. KataGo normally evaluates a random rotation or reflection of each position, so that errors deep in the tree don't all lean the same way. At the root, that randomness made the territory overlay flicker by up to a quarter point between runs, so root evaluations now use one fixed orientation.

## Where the next playout goes

<figure class="fig" id="wk-puct" style="--reserve: 400px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's selection rule on the six candidates after move 20 of the game below, with their real network priors. The blue ticks are the full 200-visit search.</figcaption>
</figure>

```ts
const explore = (scaling * prior) / (1.0 + childWeight);
const score = explore + sign * childUtility; // the best score gets the playout
```

One network evaluation is a first impression: a *policy* (where a strong player would look first) and a *value* (who seems to be ahead). Search turns that impression into calculation by spending *playouts*, walking down the tree one evaluation at a time. At each node, KataGo's PUCT rule scores every child as its observed utility plus an exploration bonus: the network's prior, scaled by a constant and divided by how much search that child has already had. The highest score gets the next playout.

Try it on the position after move 20 of the game further down. <a class="act" href="#wk-puct" data-c="1" data-playouts="100">At the default constant</a>, the network's favourite, F6, gets the first playout, comes back worse than its prior promised, and loses the search to H4, which takes 89 of the first 100 playouts. <a class="act" href="#wk-puct" data-c="0.1" data-playouts="100">With less exploration</a>, the search locks onto the early leader even harder. <a class="act" href="#wk-puct" data-c="4" data-playouts="100">With more</a>, the prior keeps pulling visits back to F6, which climbs to 26.

Around this rule, the port carries over the rest of KataGo's search: first-play urgency for unvisited moves, lower-confidence-bound move selection, symmetry deduplication at the root, subtree value-bias correction, and uncertainty-weighted visits.

## Reviewing a game

<figure class="fig wide" id="wk-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>A 9×9 game the bundled network played against itself, every position searched at 200 visits. It opens on move 37 with the swing overlay: ownership after the move minus ownership before, for changes of a quarter point or more.</figcaption>
</figure>

Once every position has been searched, each move is graded by the points of score lead it gave up, using KaTrain's six classes from <span class="swatch" style="--c: rgb(114, 33, 107)"></span>blunder (12 or more points lost) down to <span class="swatch" style="--c: rgb(30, 150, 0)"></span>best (under 0.5). To give the review real mistakes to find, the self-play generator sometimes played a lower-ranked candidate instead of the search's choice. The figure labels those planted slips on the graph.

A candidate table can tell you *that* a move lost fourteen points, but not *where* on the board they went. The swing overlay answers that. The network predicts ownership for every intersection, so subtracting the map before a move from the map after it shows which territory changed hands. On <a class="act" href="#wk-review" data-move="37" data-overlay="swing">move 37</a>, Black's planted slip at J3 costs 14 points: the overlay shows 15 points in the top right passing to White while 12 points on the left firm up for Black.

Two choices keep the overlay readable. Subtracting two whole-board estimates leaves a faint haze of tiny changes over three-quarters of the board, so only intersections that moved by at least a quarter point are painted. And the overlay prints no point total of its own. Ownership and score come from different heads of the network, and on this small net their changes disagree by 8 to 25 points. The score readout tells you *how much* a move cost; the swing map shows you *where*.
