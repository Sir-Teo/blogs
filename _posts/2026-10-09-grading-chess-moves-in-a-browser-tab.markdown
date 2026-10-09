---
layout: post
title: "Grading chess moves in a browser tab"
description: >-
  web-chess runs Stockfish inside the browser. How its review turns a score
  into a verdict, and how a weak level is made to play badly without
  hanging its queen.
date: 2026-10-09 11:00:00 -0400
excerpt: >-
  Stockfish in a browser tab. How web-chess turns an engine score into the
  label a player reads, and how its weakest level plays badly without hanging
  its queen.
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

web-chess is a chess app with Stockfish 18 running in the browser tab, for playing, importing and reviewing games. The figures run its grading code, compiled for this page. The games were reviewed by its review code, with the same Stockfish build, in Node.

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

The opponent gets its own engine because it plays with different settings. The timing at the bottom is from the app's own notes, which also record a change that looked 37% faster on one run and came out slower over five.

<figure class="fig" id="wc-device">
<figcaption>What web-chess sets up on a device like this one, from its own sizing code. Numbered cells are review engines.</figcaption>
</figure>

<a class="act" href="#wc-device" data-device="phone">A phone</a> gets one small engine. <a class="act" href="#wc-device" data-device="desktop">An 18-core desktop</a> reviews with four. <a class="act" href="#wc-device" data-device="pages">Without cross-origin isolation</a>, which GitHub Pages can't grant without the app's service worker, it loses threads but keeps the pool, since separate engines share no memory. For a while the multithreaded engine never ran at all, and nothing said so.

## From a score to a verdict

<figure class="fig" id="wc-grade" style="--reserve: 330px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>One move graded on both ladders, by web-chess's own functions, for any <em>before</em> and <em>after</em> score.</figcaption>
</figure>

A pawn in a level game matters; a pawn when you're a rook up barely does. So each move is judged on centipawns and on winning chances, and the review reports the milder verdict. <a class="act" href="#wc-grade" data-before="0" data-after="-300">Three pawns from a level position</a> is a Blunder on both ladders; <a class="act" href="#wc-grade" data-before="1000" data-after="700">the same three pawns at +10</a> is Good. <a class="act" href="#wc-grade" data-game="opera" data-ply="30">Walking into mate when already lost</a> is Good too.

## One number for a game

<figure class="fig" id="wc-accuracy" style="--reserve: 300px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Per-move accuracy for one player, each move's weight in grey below it, and four ways to sum it up. Every bar can be moved.</figcaption>
</figure>

<a class="act" href="#wc-accuracy" data-set="one">One blunder in forty moves</a> barely dents the average. web-chess does what Lichess does and averages a volatility-weighted mean with a harmonic mean, which the worst move dominates. The game comes out at 85 rather than 93.

## Reviewing a game

<figure class="fig wide" id="wc-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Two games as web-chess reviews them, Stockfish 18 at depth 16. The badge grades the move just played; the green arrow is the engine's choice.</figcaption>
</figure>

The second game was played by two of web-chess's own levels. Black was winning until <a class="act" href="#wc-review" data-game="club" data-move="38">19…Kf8</a>, which gave up 66 points of winning chances in one move. In <a class="act" href="#wc-review" data-game="opera" data-move="20">the Opera Game</a> Black's worst moves are only inaccuracies, and after 10…cxb5 the position is already gone.

## Playing badly on purpose

<figure class="fig" id="wc-variety" style="--reserve: 420px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Every legal move in a position, by what it costs (full-strength search), and where each rule's choices land.</figcaption>
</figure>

The two weakest levels used to play a random legal move 38% and 20% of the time. <a class="act" href="#wc-variety" data-level="1" data-position="8">After 4…Bxf3</a>, 33 of White's 35 moves lose three pawns or more, so a random move was usually a blunder. Now the level picks among the engine's top lines, within 1.8 pawns of its first choice. Across all 90 positions, Beginner went from losing three pawns on one move in six to never.

<p class="credit">Piece artwork: Colin M.L. Burnett's set, as drawn by react-chessboard in the app.</p>
