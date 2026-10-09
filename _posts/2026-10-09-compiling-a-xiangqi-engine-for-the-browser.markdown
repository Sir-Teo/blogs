---
layout: post
title: "Compiling a xiangqi engine for the browser"
description: >-
  How web-xiangqi compiles Pikafish to WebAssembly, ships a 53 MB neural
  network to a static host, and teaches a browser the rules, the notation and
  the repetition laws of Chinese chess.
date: 2026-10-09 12:00:00 -0400
excerpt: >-
  Xiangqi analysis with the engine compiled from source and running in the
  browser tab. How web-xiangqi builds Pikafish for WebAssembly, ships its 53 MB
  network from a static host, and checks its own rules against the engine's.
links:
  - title: Live app
    url: https://sir-teo.github.io/web-xiangqi/
  - title: Source
    url: https://github.com/Sir-Teo/web-xiangqi
styles:
  - /assets/css/web-xiangqi.css
scripts:
  - /assets/js/web-xiangqi-core.js
  - /assets/js/web-xiangqi.js
---

Xiangqi, Chinese chess, has a world-class open engine in Pikafish, a fork of Stockfish. web-xiangqi compiles it to WebAssembly itself (that was its first commit, on February 25) and builds an analysis app around it: 1,339 commits since. The boards below run the app's own rules and notation code; the engine output comes from the exact Pikafish build it ships.

## The rules

<figure class="fig" id="xq-rules">
<figcaption>web-xiangqi's own move validation. Dots are legal; crosses are moves a rule refuses. Click a dot to play it.</figcaption>
</figure>

Four rules a chess player won't expect: <a class="act" href="#xq-rules" data-preset="horse">a horse's leg can be blocked</a>, <a class="act" href="#xq-rules" data-preset="elephant">an elephant's eye too</a>, <a class="act" href="#xq-rules" data-preset="cannon">a cannon captures over exactly one screen</a>, and <a class="act" href="#xq-rules" data-preset="general">the generals may never face each other</a>. The app's move generator matches Pikafish's own counts exactly: 44 moves from the start, 1,920 two-move sequences, 79,666 three-move ones.

## Writing a move down

<figure class="fig">
<svg class="anatomy" viewBox="0 0 640 150" role="img" aria-label="The move 炮二平五 split into its parts: piece 炮 (cannon), file 二 (two, counted from the mover's right), action 平 (across), target 五 (file five). In WXF letters: C2=5.">
<g class="cell"><rect x="20" y="20" width="110" height="64" rx="8"/><text class="big cjk" x="75" y="56">炮</text><text class="cap" x="75" y="108">piece</text><text class="sub" x="75" y="126">cannon · C</text></g>
<g class="cell"><rect x="150" y="20" width="110" height="64" rx="8"/><text class="big cjk" x="205" y="56">二</text><text class="cap" x="205" y="108">file</text><text class="sub" x="205" y="126">2, from your right</text></g>
<g class="cell em"><rect x="280" y="20" width="110" height="64" rx="8"/><text class="big cjk" x="335" y="56">平</text><text class="cap" x="335" y="108">direction</text><text class="sub" x="335" y="126">across · =</text></g>
<g class="cell"><rect x="410" y="20" width="110" height="64" rx="8"/><text class="big cjk" x="465" y="56">五</text><text class="cap" x="465" y="108">to</text><text class="sub" x="465" y="126">file 5</text></g>
<text class="wxf" x="545" y="52">= C2=5</text>
</svg>
<figcaption>The most common first move, in Chinese and in WXF letters. 進 (+) is forward and 退 (−) back; moving straight forward or back, the last number counts steps, otherwise it names the file.</figcaption>
</figure>

<a class="act" href="#xq-rules" data-preset="start" data-play="h2e2">Play it on the board above</a>, or <a class="act" href="#xq-rules" data-pieces="letters">switch the pieces to letters</a>. To read a move someone typed, the app writes every legal move out in every notation and keeps the one that matches.

## Compiling Pikafish

<figure class="fig">
<svg class="arch" viewBox="0 0 680 300" role="img" aria-label="The build: Pikafish's C++ source at a pinned commit and a 340-line patch go through Emscripten 6.0.1 to four WebAssembly cores of about 0.7 MB each; the 53.7 MB network ships beside them and is 97.6% of a first visit's bytes.">
<defs>
<marker id="xq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="24" y="26" width="196" height="48" rx="6"/>
<text class="t" x="122" y="42">Pikafish</text>
<text class="st" x="122" y="59">C++, pinned to one commit</text>
<rect class="box" x="24" y="90" width="196" height="48" rx="6"/>
<text class="t" x="122" y="106">pikafish-wasm.patch</text>
<text class="st" x="122" y="123">340 lines; command() for stdin</text>
<rect class="box" x="262" y="58" width="164" height="48" rx="6"/>
<text class="t" x="344" y="74">Emscripten 6.0.1</text>
<text class="st" x="344" y="91">pinned; 6.0.2 broke threads</text>
<path class="edge" d="M220 50 H240 V82 H260" marker-end="url(#xq-arrow)"/>
<path class="edge" d="M220 114 H240 V82" />
<rect class="box" x="468" y="22" width="188" height="26" rx="5"/>
<text class="st" x="562" y="35">threads + SIMD · 710 KB</text>
<rect class="box" x="468" y="54" width="188" height="26" rx="5"/>
<text class="st" x="562" y="67">threads · 705 KB</text>
<rect class="box" x="468" y="86" width="188" height="26" rx="5"/>
<text class="st" x="562" y="99">one thread + SIMD · 659 KB</text>
<rect class="box" x="468" y="118" width="188" height="26" rx="5"/>
<text class="st" x="562" y="131">one thread · 654 KB</text>
<path class="edge" d="M426 82 H446 V35 H466 M446 67 H466 M446 99 H466 M446 131 H466 M446 35 V131" marker-end="url(#xq-arrow)"/>
<text class="lbl" x="24" y="190">What a first visit to the engine downloads: 55.1 MB</text>
<rect class="bar" x="24" y="202" width="4" height="22"/>
<rect class="bar" x="30" y="202" width="11" height="22" style="fill-opacity:0.45"/>
<rect class="bar net" x="43" y="202" width="613" height="22"/>
<text class="bl" x="24" y="244">app 0.7%</text>
<text class="bl" x="92" y="244">engine code 1.7%</text>
<text class="bl r" x="656" y="244">pikafish.nnue, 53.7 MB, 97.6%</text>
<text class="st" x="340" y="276" style="text-anchor:middle">The network is already Zstandard-compressed: served with gzip it grows by 8.8 KB.</text>
</svg>
<figcaption>One patched source tree, four cores chosen at load time by what the browser supports, and a network that is almost all of the download.</figcaption>
</figure>

The heart of the 340-line patch turns a program that reads standard input into a library with one entry point:

```cpp
extern "C" void command(const char* cmd) {
    uciP->process_command(cmd);
}
```

The toolchain is pinned too: Emscripten 6.0.2 silently broke threads. And the network is cached by the app's own service worker, because browsers won't keep a 53 MB response in the HTTP cache. With that worker also adding the two isolation headers GitHub Pages can't send, analysis runs on eight threads at 3.7 million nodes a second, against 414,000 on one.

## A clock nobody reads

<figure class="fig" id="xq-clock" style="--reserve: 360px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>One endgame, searched by Pikafish at depth 14 for every value of the FEN's halfmove clock. Blue is a forced mate.</figcaption>
</figure>

Pikafish calls a game drawn after 120 plies without a capture, and reads the count from the FEN. Mate in three needs five plies, so it holds <a class="act" href="#xq-clock" data-position="0" data-clock="115">at a clock of 115</a> and is 0.00 <a class="act" href="#xq-clock" data-position="0" data-clock="116">at 116</a>. The app once wrote 0 into every FEN, and showed mate in positions the engine called drawn.

## Repetition

<figure class="fig" id="xq-repetition" style="--reserve: 400px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>Two repeating lines, judged after each move by web-xiangqi's own check and by Pikafish's rule judge.</figcaption>
</figure>

In xiangqi, the side that checks or chases on every move of a repetition loses. The app sees <a class="act" href="#xq-repetition" data-line="check" data-move="5">perpetual check</a>, but deliberately not <a class="act" href="#xq-repetition" data-line="chase" data-move="11">perpetual chase</a>, which needs to know what is attacked and protected. Pikafish already judges both, through a command the build exposes but only a test calls.

## Reviewing a game

<figure class="fig wide" id="xq-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>A game between the app's Easy and Medium levels, reviewed by Pikafish at depth 16 with the app's review code. Read it in any notation.</figcaption>
</figure>

The game is generated on purpose. The app once shipped ten "classic games" credited to grandmasters that turned out to be fabricated, and the review is what caught them: 20 to 28% accuracy, against 7% for random moves.

[Open web-xiangqi](https://sir-teo.github.io/web-xiangqi/), switch the pieces to letters, and play the central cannon.
