---
layout: post
title: "Putting KataGo in a browser tab"
description: >-
  How web-katrain runs a KataGo network, a KataGo-style tree search and a
  KaTrain-style game review entirely inside the browser, and how it checks
  that the numbers are true.
date: 2026-10-09 10:00:00 -0400
excerpt: >-
  KaTrain-style Go analysis with the neural network, the tree search and the
  game review all running inside a browser tab. How web-katrain fits KataGo into a
  web page, and how it checks that the numbers are true.
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

web-katrain does what KaTrain does, KataGo analysis and game review, inside a browser tab with no server behind it: 1,792 commits since January 9. Every number in the figures came from running web-katrain's own engine code with its bundled network.

## The shape of the app

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

Between the two sits an analysis queue: the position on screen beats the AI's next move, which beats a background review. It cancels, drops stale results and caches, so scrubbing through a game never buries the worker.

## Running KataGo without KataGo

<figure class="fig" id="wk-env">
<figcaption>The backend web-katrain would pick in this browser, from the same feature tests the app runs.</figcaption>
</figure>

web-katrain reads KataGo's own `.bin` networks (versions 8 to 16), rebuilds them from TensorFlow.js operations and feeds them the same 22 board planes and 19 globals. Multithreaded WASM needs cross-origin isolation, which GitHub Pages can't grant, so there WASM runs on one thread. WebGPU doesn't need it.

## Is it telling the truth?

<figure class="fig" id="wk-golden" style="--reserve: 330px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's golden test position (5×5, White to play, komi 7.5), read by the KataGo binary and by web-katrain with the same network.</figcaption>
</figure>

A porting bug doesn't crash; it makes the network quietly worse at Go. KataGo's repository records what its binary says about this position with `g170-b6c96`, the network web-katrain ships. In <a class="act" href="#wk-golden" data-layer="ownership" data-source="gap">the difference</a>, four ownership values are off by one permille, and the policy is exact. A second suite checks what must hold for any position: swapping the colours gives a bit-identical input, more komi lowers Black's lead, and the ownership map sums back to the score.

## Searching like KataGo

<figure class="fig" id="wk-puct" style="--reserve: 400px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's rule for where the next playout goes, after move 20 of the game below, with the six candidates' real network priors.</figcaption>
</figure>

```ts
const explore = (scaling * prior) / (1.0 + childWeight);
const score = explore + sign * childUtility; // the best score gets the playout
```

<a class="act" href="#wk-puct" data-c="1" data-playouts="100">At the default constant</a>, the network's favourite, F6, comes back worse than its prior promised, and H4 takes 89 of the first 100 playouts. <a class="act" href="#wk-puct" data-c="0.1" data-playouts="100">Lower</a>, the search commits harder; <a class="act" href="#wk-puct" data-c="4" data-playouts="100">higher</a>, it drifts back toward the priors and F6 climbs to 26. Compare <a class="act" href="#wk-puct" data-c="1" data-playouts="100" data-real="true">the real 200-visit search</a>.

## Reviewing a game

<figure class="fig wide" id="wk-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>A 9×9 game the bundled network played against itself, every position searched at 200 visits. Dots mark moves that lost 1.5 points or more.</figcaption>
</figure>

Each move is graded by the points it lost, on KaTrain's six classes from <span class="swatch" style="--c: rgb(114, 33, 107)"></span>blunder (12 or more) to <span class="swatch" style="--c: rgb(30, 150, 0)"></span>best (under 0.5). To give the review something to find, some moves are planted: a lower-ranked candidate instead of the first choice.

The swing overlay shows where the points went, as ownership after the move minus ownership before. <a class="act" href="#wk-review" data-move="37" data-overlay="swing">Move 37</a>, Black J3, lost 14 points: 15 in the top right pass to White, and 12, mostly on the left, move the other way. It paints only changes of 0.25 or more and prints no total, because ownership and score come from different heads of the network; on the bundled net they differed by 8 to 25 points.

## Three things I'd keep

- **Put the slow work in a worker on day one,** and send it only plain data.
- **Test against ground truth, not plausibility.** The bugs to fear produce numbers that look fine.
- **Expect the browser to fail.** Storage throws in private mode and WebGPU can fail its warm-up; each failure has a slower path, not a broken one.

If you play Go, [open web-katrain](https://sir-teo.github.io/web-katrain/), load a game you lost, and turn on the swing map at the move you regret.
