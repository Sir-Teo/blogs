---
layout: post
title: "Grading chess moves in a browser tab"
description: >-
  How web-chess runs Stockfish inside the browser, turns its scores into the
  labels a chess player reads, and makes the strongest chess program in the
  world play like a beginner without hanging its queen.
date: 2026-10-09 11:00:00 -0400
excerpt: >-
  Stockfish, a game review and a sparring partner, all running inside a browser
  tab. How web-chess turns centipawns into a verdict a player can trust, and how
  it makes the strongest chess program there is play like a beginner.
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

web-chess plays, imports and reviews chess games with Stockfish 18 running in the browser tab: 1,349 commits since January 29. The figures below run web-chess's own grading code compiled for this page; the games were reviewed by its review code, with the same Stockfish build, in Node.

## Three engines in one tab

<figure class="fig">
<svg class="arch" viewBox="0 0 680 286" role="img" aria-label="Architecture: on the main thread, the board and panels, play mode and clock, and the review session; in Web Workers, an analysis engine, an opponent engine and a review pool of two to four engines; a service worker beneath everything adds isolation headers and caches the app.">
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
</svg>
<figcaption>Three kinds of Stockfish, each in its own worker. The review pool exists only while a review runs.</figcaption>
</figure>

The opponent gets its own engine because it plays with different settings, and a game review splits its positions across a short-lived pool, a contiguous run of moves each. On the Opera Game, four engines finished in 8.2 seconds against 16.5 for one.

<figure class="fig" id="wc-device">
<figcaption>What web-chess sets up on a device like this one, from its own sizing code. Numbered cells are review engines.</figcaption>
</figure>

<a class="act" href="#wc-device" data-device="phone">A phone</a> gets one small engine. <a class="act" href="#wc-device" data-device="desktop">An 18-core desktop</a> reviews with four. <a class="act" href="#wc-device" data-device="pages">Without cross-origin isolation</a>, which GitHub Pages can't grant without the app's service worker, it loses threads but keeps the pool: separate engines share no memory.

## From a score to a verdict

<figure class="fig" id="wc-grade" style="--reserve: 330px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>One move graded on both ladders, by web-chess's own functions. Drag <em>before</em> and <em>after</em> along the curve.</figcaption>
</figure>

A pawn in a level game matters; a pawn when you're a rook up barely does. So each move is judged on centipawns and on winning chances, and the review reports the milder verdict. <a class="act" href="#wc-grade" data-before="0" data-after="-300">Three pawns from a level position</a> is a Blunder on both ladders; <a class="act" href="#wc-grade" data-before="1000" data-after="700">the same three pawns at +10</a> is Good. <a class="act" href="#wc-grade" data-game="opera" data-ply="30">Walking into mate when already lost</a> is Good too.

## One number for a game

<figure class="fig" id="wc-accuracy" style="--reserve: 300px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Per-move accuracy for one player, and four ways to sum it up. Drag any bar. Grey under each bar: its weight.</figcaption>
</figure>

<a class="act" href="#wc-accuracy" data-set="one">One blunder in forty moves</a> barely dents the average. web-chess, after Lichess, averages a volatility-weighted mean with a harmonic mean, which the worst move dominates: 85 instead of 93.

## Reviewing a game

<figure class="fig wide" id="wc-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Two games as web-chess reviews them, Stockfish 18 at depth 16. The badge grades the move just played; the green arrow is the engine's choice.</figcaption>
</figure>

The second game was played by two of web-chess's own levels. Black was winning until <a class="act" href="#wc-review" data-game="club" data-move="38">19…Kf8</a> gave up 66 points of winning chances in one move. In <a class="act" href="#wc-review" data-game="opera" data-move="20">the Opera Game</a>, Black's worst moves are only inaccuracies, and after 10…cxb5 the position is gone.

## Playing badly on purpose

<figure class="fig" id="wc-variety" style="--reserve: 420px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Every legal move in a position, by what it costs (full-strength search), and where each rule's choices land.</figcaption>
</figure>

The two weakest levels used to play a random legal move 38% and 20% of the time. <a class="act" href="#wc-variety" data-level="1" data-position="8">After 4…Bxf3</a>, 33 of White's 35 moves lose three pawns or more. Now the level picks among the engine's top lines, within 1.8 pawns of its first choice. Across all 90 positions, Beginner went from losing three pawns on one move in six to never.

## Three things I'd keep

- **A silent fallback is worse than a failure.** For a while the multithreaded engine never ran, and nothing said so.
- **Grade what a player can lose,** not what the engine counts.
- **Measure five times.** One "37% faster" came out slower over five runs.

[Open web-chess](https://sir-teo.github.io/web-chess/), import a game you lost, and press Review.

<p class="credit">Piece artwork: Colin M.L. Burnett's set, as drawn by react-chessboard in the app.</p>
