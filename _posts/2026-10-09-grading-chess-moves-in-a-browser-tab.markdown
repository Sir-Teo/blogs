---
layout: post
title: "Grading chess moves for humans"
series: engines
description: >-
  How web-chess runs Stockfish 18 across a pool of Web Workers, turns raw
  centipawn scores into human move grades, and weakens its beginner opponent
  without letting it randomly hang its queen.
image: /assets/social/grading-chess-moves-in-a-browser-tab.png
date: 2026-10-09 11:00:00 -0400
excerpt: >-
  Stockfish scores positions in hundredths of a pawn: the right unit for
  searching a tree and the wrong one for judging a person. How web-chess turns
  engine numbers into verdicts a player can use, and plays badly on purpose
  without hanging its queen.
links:
  - title: Live app
    url: https://sir-teo.github.io/web-chess/
  - title: Source
    url: https://github.com/Sir-Teo/web-chess
styles:
  - /assets/css/web-chess.css
scripts:
  - /assets/js/web-chess-core.js
  - /assets/js/web-chess.js
---

Putting a chess engine in a Web Worker is the easy half of a browser chess app. The hard half starts once the engine talks. Stockfish reports positions in *centipawns*, hundredths of a pawn, which is the right unit for searching a tree and the wrong one for judging a person. And at full strength it plays at around 3,500 Elo, so a beginner opponent has to be weakened without turning into something that randomly gives away its queen.

**web-chess** runs Stockfish 18 in the tab for playing, importing, and reviewing games. The figures below run the app's own sizing and grading code, on evaluations recorded from the same Stockfish build in Node.

## Three engines in one tab

<figure class="fig">
<svg class="arch" viewBox="0 0 680 362" role="img" aria-label="Architecture: on the main thread, the board and panels, play mode and clock, and the review session; in Web Workers, an analysis engine, an opponent engine and a review pool of two to four engines; a service worker beneath everything adds isolation headers and caches the app. Below: reviewing the Opera Game took 16.5 seconds with one engine and 8.2 with four.">
<defs>
<marker id="wc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<text class="lbl" x="24" y="13">Main thread</text>
<text class="lbl" x="386" y="13">Web Workers, one Stockfish each</text>
<rect class="box" x="24" y="26" width="270" height="48" rx="6"/>
<text class="t" x="159" y="42">Board and panels</text>
<text class="st" x="159" y="59">React; the live analysis view</text>
<rect class="box" x="24" y="92" width="270" height="48" rx="6"/>
<text class="t" x="159" y="108">Play mode and clock</text>
<text class="st" x="159" y="125">your moves, premoves, takebacks</text>
<rect class="box" x="24" y="158" width="270" height="48" rx="6"/>
<text class="t" x="159" y="174">Review session</text>
<text class="st" x="159" y="191">queue, reuse, grading, accuracy</text>
<rect class="box" x="386" y="26" width="270" height="48" rx="6"/>
<text class="t" x="521" y="42">Analysis engine</text>
<text class="st" x="521" y="59">follows the board; MultiPV, WDL</text>
<rect class="box" x="386" y="92" width="270" height="48" rx="6"/>
<text class="t" x="521" y="108">Opponent engine</text>
<text class="st" x="521" y="125">Elo limit, its own options</text>
<rect class="box dash" x="394" y="166" width="270" height="48" rx="6"/>
<rect class="box dash" x="390" y="162" width="270" height="48" rx="6"/>
<rect class="box" x="386" y="158" width="270" height="48" rx="6"/>
<text class="t" x="521" y="174">Review pool</text>
<text class="st" x="521" y="191">2 to 4 engines, for one review</text>
<path class="edge-strong" d="M296 50 H384" marker-start="url(#wc-arrow)" marker-end="url(#wc-arrow)"/>
<path class="edge-strong" d="M296 116 H384" marker-start="url(#wc-arrow)" marker-end="url(#wc-arrow)"/>
<path class="edge-strong" d="M296 182 H384" marker-start="url(#wc-arrow)" marker-end="url(#wc-arrow)"/>
<text class="el" x="340" y="43">UCI</text>
<text class="el" x="340" y="109">UCI</text>
<text class="el" x="340" y="175">UCI</text>
<rect class="box" x="24" y="236" width="640" height="46" rx="6"/>
<text class="t" x="344" y="251">Service worker</text>
<text class="st" x="344" y="268">adds the two isolation headers to every response · keeps the app and engine for offline use</text>
<text class="lbl" x="24" y="308">Reviewing the Opera Game, depth 18</text>
<rect class="bar" x="130" y="316" width="526" height="14"/>
<text class="bl mid" x="24" y="323">one engine</text>
<text class="bl r in" x="650" y="323">16.5 s</text>
<rect class="bar" x="130" y="336" width="261" height="14"/>
<text class="bl mid" x="24" y="343">four engines</text>
<text class="bl r in" x="385" y="343">8.2 s</text>
</svg>
<figcaption>Three kinds of Stockfish, each in its own worker. The review pool exists only while a review runs, and splits the game into one contiguous run of moves per engine.</figcaption>
</figure>

The app talks to each engine in UCI, the plain-text protocol chess engines speak. It keeps separate engines in separate workers instead of sharing one, because the jobs want different settings. Live analysis wants several candidate lines (`MultiPV`) and win/draw/loss estimates. The opponent wants `UCI_LimitStrength` and an Elo cap. And switching one engine between jobs isn't free: re-sending an option like `Hash`, even with the same value, clears Stockfish's transposition table, its memory of positions it has already searched.

A full game review gets a temporary pool of two to four engines. Each one takes a contiguous stretch of the game, so its table stays warm from one move to the next. On the Opera Game at depth 18, that halves the review, from 16.5 seconds on one engine to 8.2 on four.

## Sized to the device

<figure class="fig" id="wc-device">
<figcaption>What web-chess sets up on a device like this one, from its own sizing code. Numbered cells are review engines.</figcaption>
</figure>

How many engines and threads the app starts depends on what the browser reports. <a class="act" href="#wc-device" data-device="phone">A phone</a> gets one small single-threaded engine, a 16 MB hash table, and a single line of analysis, since each extra line costs two to four times the search. <a class="act" href="#wc-device" data-device="desktop">An 18-core desktop</a> gets four review engines with two threads each.

Threads need shared memory, and browsers only allow it on cross-origin isolated pages, which GitHub Pages can't make on its own; the app's service worker adds the headers. <a class="act" href="#wc-device" data-device="pages">Without isolation</a>, every engine drops to one thread, but the review pool still runs at full width, because separate workers never shared memory anyway.

That single-thread fallback was supposed to be rare. For a long time it was the only path anyone got: a missing bootstrap wrapper made the multithreaded build die at startup, and the app fell back without a word. Nothing looked broken. Fixing it took a depth-16 search from 443,000 to 3.5 million nodes a second.

## From a score to a verdict

<figure class="fig" id="wc-grade" style="--reserve: 330px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>One move graded on both ladders, by web-chess's own functions, for any <em>before</em> and <em>after</em> score.</figcaption>
</figure>

Losing a pawn in a level endgame can cost you the game. Losing a pawn when you're already a rook up changes nothing. Centipawns can't tell those apart. Winning chances can.

web-chess converts each evaluation into a winning chance with Lichess's logistic curve, grades every move twice (on centipawns lost and on winning chances lost), and reports the milder verdict. <a class="act" href="#wc-grade" data-before="0" data-after="-300">Three pawns from a level position</a> cuts your chances from 50% to 25%: a Blunder on both ladders. <a class="act" href="#wc-grade" data-before="1000" data-after="700">The same three pawns at +10</a> takes you from 97% to 93% and is graded Good.

Even <a class="act" href="#wc-grade" data-game="opera" data-ply="30">walking into mate when already lost</a> (`15…Nxd7` in the Opera Game) comes out Good. Stockfish encodes a forced mate as a 100-pawn score, so on the raw scale this move looks like a 90-pawn catastrophe. That sentinel once pushed the Opera Game's average centipawn loss to 316 in a report that also counted zero mistakes. The winning-chance curve sees what actually happened: a lost position ended one move sooner.

## One number for a game

<figure class="fig" id="wc-accuracy" style="--reserve: 300px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Per-move accuracy for one player, each move's weight in grey below it, and four ways to sum it up. Every bar can be moved.</figcaption>
</figure>

Turning forty per-move scores into one accuracy number looks like a job for an average, and for its first seven months web-chess used one. The trouble is that <a class="act" href="#wc-accuracy" data-set="one">one blunder in forty moves</a> barely dents a mean. Thirty-nine solid moves at 95 and one game-losing blunder at 9.5 still average 93, which reads like a near-perfect game.

Following Lichess, web-chess now averages two other summaries. The first weights each move by how volatile the game was around it (the standard deviation of winning chances over a local window), so moves made while the balance is swinging count far more than routine moves in a dead ending. The second is the harmonic mean, which the worst move dominates. Together they pull the one-blunder game from 93 down to 85. Drag the blunder bar back up and the penalty disappears as soon as the mistake stops being fatal.

## Reviewing a game

<figure class="fig wide" id="wc-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Two games as web-chess reviews them, Stockfish 18 at depth 16. The badge grades the move just played; the green arrow is the engine's choice.</figcaption>
</figure>

Put the worker pool, the two grading ladders, and the opening book together and you get the review above. The default game was played between two of the app's own levels, Club as White and Intermediate as Black. Black was winning for most of it until White played `19.Nxf6+`. Instead of recapturing, Black stepped away with <a class="act" href="#wc-review" data-game="club" data-move="38">19…Kf8</a>, giving up 8.6 pawns and 66 points of winning chances in one move: the only Blunder in either game.

Switch to <a class="act" href="#wc-review" data-game="opera" data-move="20">the Opera Game</a> and Black's worst moves (`6…Nf6` and `10…cxb5`) are only Inaccuracies. After `10…cxb5` the engine already has Black four pawns down, so the famous fireworks that follow cost Black very few winning chances it still had.

Not every speedup on this screen survived measurement. Stepping through a reviewed game redraws its evaluation graph on every key press, and splitting the graph's static half into its own memoized component read 68 ms a press down to 43 ms on one run: a 37% win. Run five times on each build, the version *without* the split had the lower median:

<figure class="fig">
<svg class="arch" viewBox="0 0 480 182" role="img" aria-label="Dot plot of five timed walks per build. With the split: 597, 789, 1,091, 1,152 and 2,958 milliseconds of long frames, median 1,091. Without it: 553, 553, 806, 1,347 and 2,919, median 806.">
<text class="lbl" x="0" y="13">Long frames over one 20-ply walk, five walks per build</text>
<text class="bl mid" x="0" y="56">with the split</text>
<text class="bl mid" x="0" y="106">without it</text>
<path class="edge" d="M120 81 H460" style="stroke:var(--line)"/>
<circle cx="187.7" cy="56" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="209.4" cy="56" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="243.6" cy="56" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="250.6" cy="56" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="455.2" cy="56" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="182.7" cy="100" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="182.7" cy="112" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="211.3" cy="106" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="272.7" cy="106" r="5" style="fill:var(--fg);fill-opacity:0.72"/><circle cx="450.8" cy="106" r="5" style="fill:var(--fg);fill-opacity:0.72"/>
<path class="edge-strong" d="M243.6 40 V72" style="stroke:var(--accent);stroke-width:2"/>
<text class="el" x="243.6" y="34">median 1,091 ms</text>
<path class="edge-strong" d="M211.3 90 V122" style="stroke:var(--accent);stroke-width:2"/>
<text class="el" x="211.3" y="136">median 806 ms</text>
<path class="edge" d="M120 150 H460 M120 150 V154 M233.3 150 V154 M346.7 150 V154 M460 150 V154"/>
<text class="el" x="120" y="170">0</text>
<text class="el" x="233.3" y="170">1 s</text>
<text class="el" x="346.7" y="170">2 s</text>
<text class="el" x="460" y="170">3 s</text>
</svg>
<figcaption>The same 20-ply walk, timed five times on each build. The spread inside either build is wider than the gap between them, and the build without the change has the lower median.</figcaption>
</figure>

The spread inside one build was larger than the gap between builds, so the 37% was noise, and the change was reverted. A single timing on a machine this noisy isn't a result yet.

## Playing badly on purpose

<figure class="fig" id="wc-variety" style="--reserve: 420px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Every legal move in a position, by what it costs (full-strength search), and where each rule's choices land.</figcaption>
</figure>

Stockfish's built-in `UCI_LimitStrength` only goes down to 1,320 Elo, which still flattens a casual player. To soften the two weakest levels, Beginner and Novice, web-chess originally played a uniformly random legal move 38% and 20% of the time.

No beginner chooses moves by rolling a die over every legal move on the board. <a class="act" href="#wc-variety" data-level="1" data-position="8">After 4…Bxf3</a> in the Opera Game, White has to take back the bishop, and 33 of White's 35 legal moves leave it hanging and lose three pawns or more. Under the old rule, Beginner walked into one of those more than a third of the time.

Now the opponent asks Stockfish for its top four lines and only varies among moves within 1.8 pawns of its first choice (0.9 for Novice). Here that means choosing between the two sensible recaptures, `Qxf3` and `gxf3`. Across all 90 positions in both games, Beginner went from throwing away three or more pawns on one move in six to never doing so.

Every section of this post is the same fix in a different place. Stockfish's raw number is right for Stockfish and wrong for the person reading it, so the app translates: winning chances instead of centipawns, a volatility-weighted accuracy instead of a plain mean, and a weakened opponent that still picks between sensible moves.

<p class="credit">Piece artwork: Colin M.L. Burnett's set, as drawn by react-chessboard in the app.</p>
