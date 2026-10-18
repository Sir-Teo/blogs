---
layout: post
title: "Grading chess moves in a browser tab"
description: >-
  How web-chess runs Stockfish 18 across a pool of Web Workers, turns raw
  centipawn scores into human move grades, and weakens its beginner opponent
  without letting it randomly hang its queen.
date: 2026-10-09 11:00:00 -0400
excerpt: >-
  Stockfish 18 inside a browser tab—how web-chess sizes its worker pool,
  translates engine evaluations into verdicts a human player can use, and makes
  its weakest level play badly on purpose without hanging its queen.
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

Putting a chess engine in a Web Worker is the easy half of building a browser chess app. The harder half starts once the engine speaks: turning raw centipawn numbers into move grades that match how a human experiences a game, and weakening a 3,500-Elo monster into a beginner opponent that makes natural mistakes without randomly giving away its queen. **web-chess** runs Stockfish 18 directly in the browser tab for playing, importing, and reviewing games. Every interactive figure below runs the app's own sizing and grading code in the page, using evaluations recorded from the same Stockfish build in Node.

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

Instead of multiplexing a single Stockfish instance across every task, web-chess keeps separate engines in separate Web Workers. Live analysis wants `MultiPV` and win-draw-loss statistics; the AI opponent wants `UCI_LimitStrength` and an Elo cap; and re-sending UCI options like `Hash` between turns silently flushes the engine's transposition table even when the hash size hasn't changed. When you ask for a full game review, the app spins up a temporary pool of two to four workers and hands each one a contiguous slice of the game so its hash table stays warm from move to move. (An earlier experiment tried to speed reviews up further and clocked a 37% win on a single run—until a five-run benchmark showed it was actually slower.)

<figure class="fig" id="wc-device">
<figcaption>What web-chess sets up on a device like this one, from its own sizing code. Numbered cells are review engines.</figcaption>
</figure>

How many workers and threads the app spawns depends on what the browser reports. <a class="act" href="#wc-device" data-device="phone">A phone</a> gets one small, single-threaded engine, a 16 MB hash table, and a single principal variation, since a second line costs two to four times the search effort. <a class="act" href="#wc-device" data-device="desktop">An 18-core desktop</a> spins up four review engines with two threads each. <a class="act" href="#wc-device" data-device="pages">Without cross-origin isolation</a>—which GitHub Pages cannot grant unless the app's service worker intercepts the page—shared memory disappears and each engine drops to one thread, but the four-worker review pool still runs at full width because separate workers share no memory. For a long time, a missing bootstrap wrapper meant the multithreaded build died at startup and silently fell back to single-threaded WASM; fixing that one silent fallback took a depth-16 search from 443,000 to 3.5 million nodes a second.

## From a score to a verdict

<figure class="fig" id="wc-grade" style="--reserve: 330px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>One move graded on both ladders, by web-chess's own functions, for any <em>before</em> and <em>after</em> score.</figcaption>
</figure>

Stockfish measures positions in *centipawns* (hundredths of a pawn), which is the right unit for searching a tree and the wrong unit for judging a person. Losing a pawn in a level endgame can cost the game; losing a pawn when you are already a rook ahead changes nothing.

To judge moves in context, web-chess converts centipawn evaluations into winning chances using Lichess's logistic curve, grades every move on both centipawns lost and winning chances lost, and reports the milder of the two verdicts. <a class="act" href="#wc-grade" data-before="0" data-after="-300">Three pawns from a level position</a> cuts your winning chances from 50% to 25% and registers as a Blunder on both ladders; <a class="act" href="#wc-grade" data-before="1000" data-after="700">the same three pawns at +10</a> nudges your winning chances from 97% to 93% and is graded Good. Even <a class="act" href="#wc-grade" data-game="opera" data-ply="30">walking into mate when already lost</a> (`15…Nxd7` in the Opera Game) comes out Good: Stockfish encodes forced mate with a 100-pawn sentinel, which looks like a 90-pawn catastrophe on the raw scale—and once inflated the Opera Game's average centipawn loss to 316 beside zero mistakes—whereas the winning-chance curve simply sees a lost position ending a move sooner.

## One number for a game

<figure class="fig" id="wc-accuracy" style="--reserve: 300px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Per-move accuracy for one player, each move's weight in grey below it, and four ways to sum it up. Every bar can be moved.</figcaption>
</figure>

Turning forty per-move scores into a single game accuracy looks like a job for a plain average, and for its first seven months web-chess used one. The trouble is that <a class="act" href="#wc-accuracy" data-set="one">one blunder in forty moves</a> barely dents an arithmetic mean: thirty-nine solid moves at 95 and a single game-throwing blunder at 9.5 still average 93, which reads like a near-flawless game.

Following Lichess, web-chess now averages two different summaries instead. The first weights each move by how volatile the game was around it—the standard deviation of winning chances over a local window—so moves played while the balance is swinging count far more than routine moves in a dead ending. The second is the harmonic mean, which is dominated by the worst move on the board. Averaging the two pulls that one-blunder game down from 93 to 85, while dragging the blunder bar back up shows the penalty disappearing as soon as the mistake is no longer fatal.

## Reviewing a game

<figure class="fig wide" id="wc-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Two games as web-chess reviews them, Stockfish 18 at depth 16. The badge grades the move just played; the green arrow is the engine's choice.</figcaption>
</figure>

Putting the worker pool, the dual grading ladders, and the opening book together produces the full review above, searched at depth 16. The default game was played between two of web-chess's own levels, Club as White and Intermediate as Black. Black was winning for most of the afternoon until White played `19.Nxf6+`; instead of taking the knight back, Black stepped away with <a class="act" href="#wc-review" data-game="club" data-move="38">19…Kf8</a>, surrendering 8.6 pawns and 66 points of winning chances in a single move—the only Blunder in either game. Switch to <a class="act" href="#wc-review" data-game="opera" data-move="20">the Opera Game</a> and Black's worst slips (`6…Nf6` and `10…cxb5`) are only Inaccuracies: after `10…cxb5` the position is already four pawns down in the engine's eyes, so none of the famous fireworks that follow cost Black many winning chances it still had.

## Playing badly on purpose

<figure class="fig" id="wc-variety" style="--reserve: 420px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Every legal move in a position, by what it costs (full-strength search), and where each rule's choices land.</figcaption>
</figure>

Stockfish's built-in `UCI_LimitStrength` option only goes down to 1,320 Elo, which is still strong enough to overwhelm a casual player. To soften the two weakest levels (`Beginner` and `Novice`), web-chess originally injected variety by picking a uniformly random legal move 38% and 20% of the time.

No human beginner plays chess by rolling a die across every legal move on the board. <a class="act" href="#wc-variety" data-level="1" data-position="8">After 4…Bxf3</a> in the Opera Game, White has to recapture the bishop; 33 of White's 35 legal moves leave the piece hanging and immediately lose three pawns or more. Under the old rule, Beginner wandered into one of those unforced blunders more than a third of the time. Now the opponent asks Stockfish for its top four candidate lines and only varies among moves that stay within 1.8 pawns of its first choice (0.9 for Novice)—which here means choosing between the two sensible recaptures, `Qxf3` and `gxf3`. Across all 90 positions in both games, Beginner went from throwing away three or more pawns on one move in six to never doing so at all.

<p class="credit">Piece artwork: Colin M.L. Burnett's set, as drawn by react-chessboard in the app.</p>
