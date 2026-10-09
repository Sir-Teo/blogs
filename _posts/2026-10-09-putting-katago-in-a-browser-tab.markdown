---
layout: post
title: "Putting KataGo in a browser tab"
description: >-
  web-katrain runs a KataGo network and search inside the browser. Figures
  from its own engine code, and the test that compares it with KataGo.
date: 2026-10-09 10:00:00 -0400
excerpt: >-
  Go analysis in a browser tab, with the network and the search running on
  your own machine. Figures from web-katrain's engine code, and the test that
  compares it with KataGo's.
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

web-katrain runs KataGo analysis and a KaTrain-style game review inside a browser tab, with no server behind it. Every number in the figures below came out of its own engine code, run with the network it bundles.

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

The analysis queue in the middle decides what the worker does next. The position on screen comes first, then the AI's next move, then any background review. Requests that have gone stale are cancelled and finished results are cached, so scrubbing through a game doesn't pile work onto the worker.

## Which backend

<figure class="fig" id="wk-env">
<figcaption>The backend web-katrain would pick in this browser, from the same feature tests the app runs.</figcaption>
</figure>

web-katrain reads KataGo's own `.bin` networks (versions 8 to 16), rebuilds them from TensorFlow.js operations and feeds them the same 22 board planes and 19 globals. Multithreaded WASM needs cross-origin isolation, which GitHub Pages can't grant, so there WASM runs on one thread. WebGPU doesn't need it, though its warm-up can fail, and storage throws in private mode. Each of those has a slower path.

## Checking against KataGo

<figure class="fig" id="wk-golden" style="--reserve: 330px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's golden test position (5×5, White to play, komi 7.5), read by the KataGo binary and by web-katrain with the same network. The board opens on the difference between the two.</figcaption>
</figure>

The bugs to worry about in a port like this don't crash anything. They leave the network a little worse at Go, and nothing on screen looks wrong. KataGo's repository records what its binary says about this position with `g170-b6c96`, the network web-katrain ships, so there is something exact to compare against. <a class="act" href="#wk-golden" data-layer="ownership" data-source="gap">Four ownership values</a> differ, each by one permille. <a class="act" href="#wk-golden" data-layer="policy" data-source="gap">The policy</a> matches to the digit. A second test suite checks properties that hold for any position: swapping the colours gives a bit-identical input, more komi lowers Black's lead, and the ownership map sums back to the score.

## Where the next playout goes

<figure class="fig" id="wk-puct" style="--reserve: 400px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's selection rule on the six candidates after move 20 of the game below, with their real network priors. The blue ticks are the full 200-visit search.</figcaption>
</figure>

```ts
const explore = (scaling * prior) / (1.0 + childWeight);
const score = explore + sign * childUtility; // the best score gets the playout
```

<a class="act" href="#wk-puct" data-c="1" data-playouts="100">At the default constant</a>, the network's favourite, F6, comes back worse than its prior promised, and H4 takes 89 of the first 100 playouts. <a class="act" href="#wk-puct" data-c="0.1" data-playouts="100">With less exploration</a> the search commits even harder. <a class="act" href="#wk-puct" data-c="4" data-playouts="100">With more</a>, it drifts back toward the priors and F6 gets 26.

## Reviewing a game

<figure class="fig wide" id="wk-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>A 9×9 game the bundled network played against itself, every position searched at 200 visits. It opens on move 37 with the swing overlay: ownership after the move minus ownership before, for changes of a quarter point or more.</figcaption>
</figure>

Moves are graded by the points they lost, on KaTrain's six classes from <span class="swatch" style="--c: rgb(114, 33, 107)"></span>blunder (12 or more) to <span class="swatch" style="--c: rgb(30, 150, 0)"></span>best (under 0.5). Some moves are planted, a lower-ranked candidate played instead of the first choice, so the review has something to catch. The figure labels those.

<a class="act" href="#wk-review" data-move="37" data-overlay="swing">Move 37</a>, Black J3, lost 14 points. The swing map shows 15 points in the top right passing to White and 12, mostly on the left, going the other way, and it prints no total. Ownership and score come from different heads of the network, and on this net they disagree by 8 to 25 points.
