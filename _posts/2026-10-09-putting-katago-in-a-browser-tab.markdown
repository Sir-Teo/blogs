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

KaTrain is the best tool I know for understanding a game of Go: it runs KataGo over every move and colours each one by how many points it cost. It is also a desktop app with an engine binary to install. web-katrain is my attempt at the same experience behind a link, with the neural network, the tree search and the review all running inside the browser tab and no server behind them. It runs on desktop and mobile, and works offline once installed.

The project started on January 9 this year as a React board that could load an SGF file. Nine months and 1,792 commits later it is about 80,000 lines of application TypeScript and 440 test files. It covers the core of what KaTrain does, plus a few things the browser makes easy: opening a game from an Online-Go link, reading a board position from a photo, or sharing a whole game inside a URL.

This post covers the parts that were interesting to build: how an engine fits into a web page, how I convinced myself that a from-scratch port tells the truth, and what the review layer actually computes. The figures are interactive, and their numbers are real. I ran web-katrain's own engine code offline with its bundled network and saved the output for this page.

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
<figcaption>How the app is split. Everything slow lives in the worker. The UI only talks to the store, and the store is the only thing that knows an engine exists.</figcaption>
</figure>

There are two halves, and the line between them is the most important design decision in the codebase. The main thread owns everything you touch: the React components and a single Zustand store that holds the game tree, the settings and the UI modes. A dedicated Web Worker owns everything slow: loading the model, building input tensors, running the network and the search. A search that takes two seconds never makes the board stutter, because it runs on another thread.

Three rules keep that boundary honest:

- **Components never talk to the worker.** They read state from the store and call its actions.
- **Messages are plain data.** Requests and results cross with `postMessage`, so everything in them has to survive structured cloning: no class instances and no closures.
- **Analysis lives on the game tree.** Each result is attached to the `GameNode` it describes, so every branch keeps its own analysis and an SGF export can carry it along.

Between the store and the worker sits an analysis queue. It orders jobs (the position on screen beats the AI's next move, which beats a background review of the whole game), cancels them by group, drops results for positions you have already left, and caches what it has seen. Without it, scrubbing quickly through a game would bury the worker in requests nobody wants any more.

## Running KataGo without KataGo

A browser can't run the KataGo binary, so web-katrain doesn't wrap it. It reads KataGo's own `.bin` network files (format versions 8 through 16), rebuilds the same network out of TensorFlow.js operations, and feeds it the same inputs. Those are 22 feature planes over the board (stones, liberties, ko, ladders, the last five moves) and 19 global values for komi and rules.

TensorFlow.js can run that graph on three backends. web-katrain asks for WebGPU first. If WebGPU is missing or fails its warm-up it falls back to WebAssembly, and plain JavaScript on the CPU is the last resort. Figure 2 runs the same checks in the browser you are reading this in.

<figure class="fig" id="wk-env">
<figcaption>The backend web-katrain would pick in the browser you are using now. The page runs the same feature tests the app does; it doesn't download a model.</figcaption>
</figure>

The cross-origin isolation row is the catch. Multithreaded WASM needs `SharedArrayBuffer`, and browsers only expose that to pages served with two headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages, which hosts both this blog and the live app, can't send custom headers, so there a WASM fallback runs on one thread. WebGPU doesn't need the headers, and it's the path most current desktop browsers take. Vite's dev and preview servers send both headers, and the production build ships a `_headers` file for hosts that read one.

The default network is deliberately tiny: a 3.6 MB six-block test net, so the app boots quickly on a phone. It's fine for trying the interface but weak for real analysis. For that, Settings offers KataGo's b18 network (about 96 MB), and you can load your own weights up to 128 MB.

## Is it telling the truth?

A reimplementation has to answer two separate questions: is it strong, and is it right? A bug in feature extraction doesn't crash anything. It makes the network a little worse at Go in a way that nobody notices for weeks. I wanted tests that would catch that kind of silent drift.

KataGo's repository has exactly the fixture I needed. It records the output of the real KataGo binary running `g170-b6c96`, the same network web-katrain ships, on one small position. web-katrain's golden test rebuilds that position, pushes it through its own model parser, graph, input planes and post-processing, and compares every number. Figure 3 puts the two side by side.

<figure class="fig" id="wk-golden" style="--reserve: 330px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>KataGo's golden position (5×5, White to play, Tromp-Taylor rules, komi 7.5) as KataGo and web-katrain read it. <em>Policy</em> is where the network would play; <em>ownership</em> is who it expects each point to belong to.</figcaption>
</figure>

No point on the board differs by more than one permille. <a class="act" href="#wk-golden" data-layer="ownership" data-source="gap">The difference view</a> makes that concrete: four ownership values are off by one, and the policy matches to the permille. The win rates agree to two hundredths of a percent, and KataGo rounded its own printout, so part of even that gap is rounding. The test's tolerances sit at about four times the observed error. They used to allow twenty times as much, which was loose enough to let a half-percent win-rate error through.

A golden test pins down one position. A second test file checks properties that have to hold for *any* position, whatever the network thinks:

- **Colour-swap antisymmetry.** Swap every stone and the side to move and negate komi, and the input tensor must come out bit-identical, because the network only sees "me" and "them". Any asymmetry in the reported numbers is a sign-convention bug.
- **Komi direction.** More komi must lower Black's lead and win rate, by roughly a point of lead per point of komi.
- **Ownership against score.** Under area scoring the ownership map sums to Black's area minus White's, so that sum minus the reported lead should give back komi. This ties two heads of the network together and catches a transposed board.
- **Reproducibility.** The same position analysed twice must produce the same territory estimate.

That last one sounds obvious, but it took real work. KataGo evaluates positions under random rotations and reflections of the board, which decorrelates errors deep in the tree. At the root, the one position whose numbers you actually read, that randomness only adds noise. On the bundled network, one view of a position can disagree with another by 0.25 of ownership on a single point, and the territory overlay would flicker from run to run. So the root always uses a fixed symmetry, or averages several when the backend is fast enough.

## Searching like KataGo

The network gives a first impression of every move: a *policy* (where a strong player would probably play) and a *value* (who is winning). Search turns that impression into a judgement. It spends *playouts*, single walks down the tree that each end in one new network evaluation, and at every node it decides which move deserves the next one. This is KataGo's rule as web-katrain ports it:

```ts
// How hard to explore, given the weight already spent below this node.
function cpuctExploration(totalChildWeight: number): number {
  return (
    CPUCT_EXPLORATION + // 1.0
    CPUCT_EXPLORATION_LOG * // 0.45
      Math.log((totalChildWeight + CPUCT_EXPLORATION_BASE) / CPUCT_EXPLORATION_BASE) // base 500
  );
}

// scaling = cpuctExploration(W) * sqrt(W + 0.01) * stdevFactor
// Each child scores its own value plus this bonus; the best score gets the playout.
const explore = (scaling * prior) / (1.0 + childWeight);
const score = explore + sign * childUtility;
```

Moves the network likes get looked at first. Every visit shrinks a move's bonus, so after the first few visits a move only keeps getting playouts if its value holds up. Figure 4 runs that rule at the root of a real position from the game further down, cut down to one level: each playout returns a noisy sample around the value web-katrain's full search found for that move.

<figure class="fig" id="wk-puct" style="--reserve: 400px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>Where the next playout goes, after move 20 of the game in Figure 5. The six candidates carry their real network priors, and the arrow marks the move the rule picks next. Unvisited moves borrow a value from their parent, which KataGo calls first-play urgency.</figcaption>
</figure>

<a class="act" href="#wk-puct" data-c="1" data-playouts="100">At the default constant</a>, the network's favourite, F6, gets the first playout, comes back worse than its prior promised, and H4 takes over with 89 of the first 100 playouts. <a class="act" href="#wk-puct" data-c="0.1" data-playouts="100">Turn the constant down</a> and the search commits even harder to whatever looks best so far. <a class="act" href="#wk-puct" data-c="4" data-playouts="100">Turn it up</a> and the visits drift back toward the priors, with F6 climbing to 26. <a class="act" href="#wk-puct" data-c="1" data-playouts="100" data-real="true">Mark the full search</a> to see where web-katrain's real 200-visit search spent its effort.

The toy leaves out most of what makes KataGo's search good, and that is where most of the porting effort went. web-katrain follows KataGo's C++ rather than a textbook loop:

- Node statistics are rebuilt from a node's children after every playout.
- The final ranking uses lower confidence bounds rather than raw visit counts.
- At the root, symmetric copies of a move are searched only once.
- A subtree value-bias table corrects a node's evaluation using what the search has learned about similar local shapes.
- Networks from version 10 onward estimate their own uncertainty, and each visit is weighted by how much the network trusts its own judgement.

## Reviewing a game

Review is where KaTrain shines, and it is most of what web-katrain is for. Every move gets a single number, *points lost*: how far the mover's score lead fell between the position before the move and the position after it. KaTrain sorts that into six classes, from <span class="swatch" style="--c: rgb(114, 33, 107)"></span>blunder at 12 points or more down to <span class="swatch" style="--c: rgb(30, 150, 0)"></span>best at under half a point, with steps at 12, 6, 3, 1.5 and 0.5. web-katrain uses the same scale, so a report reads the same in either app.

Figure 5 is a 9×9 game the bundled network played against itself, with every position analysed by web-katrain's search. To give the review something to find, the generator sometimes played one of the search's lower-ranked candidates instead of its first choice. Step through with the slider, the arrow keys, or by dragging across the graph. <span class="only-hover">Hover over</span><span class="only-touch">Tap</span> a candidate to see the line the engine expects.

<figure class="fig wide" id="wk-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-katrain-demo.json' | relative_url }}">
<figcaption>A 9×9 game the bundled network played against itself, every position searched by web-katrain at 200 visits. Dots on the graph mark moves that lost 1.5 points or more. On the board, the ringed dot is the engine's first choice and every candidate is coloured by what it would cost.</figcaption>
</figure>

The *Swing* overlay is the newest piece, and my favourite. The candidate list can tell you that a move lost five points, but not *where* those points went. Ownership is estimated per intersection, though, so subtracting the map before a move from the map after it shows which points changed hands. <a class="act" href="#wk-review" data-move="37" data-overlay="swing">Try it on move 37</a>: Black's J3 lost 14 points, and the map shows where they went. Fifteen points in the top right pass to White, while twelve, most of them on the left, move the other way.

Two details make it usable.

First, the difference between two whole-board estimates leaves a faint haze everywhere. On one real move about three-quarters of the overlay's cells carried some non-zero change, which reads as "the whole board moved". So only points that moved by at least 0.25 are painted. Second, the overlay deliberately reports no point total. Ownership and score come from different heads of the network, and they don't have to agree: over eight consecutive 9×9 positions on the bundled net, the change in ownership and the change in score lead differed by 8 to 25 points. A wash that contradicted the score printed next to it would be worse than no wash, so the score readout says *how much* and the swing says *where*.

## Playing like a person

Reviewing is half of studying. The other half is playing, against something that plays back at a sensible level. web-katrain carries over KaTrain's AI strategies (`rank`, `weighted`, `pick`, `territory`, `influence` and the rest), each labelled with KaTrain's calibrated strength estimate, so you know roughly which rank you are up against.

KataGo 1.15 added a second network trained on human games, which predicts the move a player of a given rank would choose rather than the best move. web-katrain can load it alongside the main network. The `human` bot samples from it at the rank you pick, so its mistakes look like a person's. The review uses it the other way round: it can say whether the move you played is a normal choice at your level or an unusual one, not just how many points it cost.

## What I would tell myself in January

- **Put the slow work in a worker on day one, and only ever send it plain data.** Cancellation, priorities, background review and offline caching all assumed that boundary later.
- **Test against ground truth, not plausibility.** The bugs to fear in an engine port produce numbers that look fine. A golden fixture plus a handful of invariants caught sign and indexing slips that no amount of looking at the board would have.
- **Treat the browser as an unreliable platform.** Storage can throw in private mode or when the quota fills. WebGPU can be present and still fail warm-up. The headers you need may not be yours to send. Each of those has a fallback path, so a failure makes the app slower or plainer instead of breaking it.
- **Cache what is used.** The service worker precaches the app shell, the default model and the one WASM build the deployment can run. Everything else is cached the first time you use it, so what you rely on works offline and nothing else takes up space.

If you play Go, [open web-katrain](https://sir-teo.github.io/web-katrain/), load a game you lost recently, and turn on the swing map at the move you regret.
