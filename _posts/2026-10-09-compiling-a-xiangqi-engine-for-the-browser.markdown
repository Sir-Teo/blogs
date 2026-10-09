---
layout: post
title: "Compiling a xiangqi engine for the browser"
description: >-
  web-xiangqi compiles Pikafish to WebAssembly and serves its 53 MB network
  from a static host. The rules, the notation and the repetition law, as
  boards you can play on.
date: 2026-10-09 12:00:00 -0400
excerpt: >-
  Xiangqi analysis with Pikafish compiled from source and running in the
  browser tab. The rules, the notation and the repetition law, as boards you
  can play on.
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

Pikafish is the strong open engine for xiangqi, Chinese chess, and a fork of Stockfish. web-xiangqi compiles it to WebAssembly and builds an analysis app around it. The boards below run the app's rules and notation code in the page. The engine output comes from the Pikafish build the app ships, run offline.

## The rules

<figure class="fig" id="xq-rules">
<figcaption>web-xiangqi's own move validation for the piece picked up. Dots are legal; crosses are moves a rule refuses, and the piece in the way is ringed.</figcaption>
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
<svg class="arch" viewBox="0 0 680 372" role="img" aria-label="The build: Pikafish's C++ source at a pinned commit and a 340-line patch go through Emscripten 6.0.1 to four WebAssembly cores of about 0.7 MB each; the 53.7 MB network ships beside them and is 97.6% of a first visit's bytes. With the isolation headers, the threaded core searches 3.7 million nodes a second on eight threads against 414,000 on one.">
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
<text class="lbl" x="24" y="316">Nodes searched a second, with the isolation headers</text>
<rect class="bar" x="118" y="326" width="60" height="14"/>
<text class="bl mid" x="24" y="333">one thread</text>
<text class="bl mid" x="186" y="333">414,000</text>
<rect class="bar net" x="118" y="346" width="538" height="14"/>
<text class="bl mid" x="24" y="353">eight threads</text>
<text class="bl r in" x="650" y="353">3.7 million</text>
</svg>
<figcaption>One patched source tree, four cores chosen at load time by what the browser supports, a network that is almost all of the download, and what the threads buy.</figcaption>
</figure>

Most of the 340-line patch is plumbing. The part that matters turns a program that reads standard input into a library with one entry point:

```cpp
extern "C" void command(const char* cmd) {
    uciP->process_command(cmd);
}
```

Emscripten is pinned because 6.0.2 broke threads without saying so. The network is cached by the app's own service worker, since browsers won't keep a 53 MB response in the HTTP cache, and the same worker adds the two isolation headers that GitHub Pages can't send and the threaded core needs.

## The halfmove clock

<figure class="fig" id="xq-clock" style="--reserve: 360px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>One endgame, searched by Pikafish at depth 14 for every value of the FEN's halfmove clock. Blue is a forced mate.</figcaption>
</figure>

Pikafish calls a game drawn after 120 plies without a capture, and reads the count from the FEN. Mate in three needs five plies, so the mate is still there <a class="act" href="#xq-clock" data-position="0" data-clock="115">at a clock of 115</a> and gone <a class="act" href="#xq-clock" data-position="0" data-clock="116">at 116</a>. The app used to write 0 into every FEN, and showed mates in positions the engine would have called drawn.

## Repetition

<figure class="fig" id="xq-repetition" style="--reserve: 400px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>Two repeating lines, judged after each move by web-xiangqi's own check and by Pikafish's rule judge.</figcaption>
</figure>

In xiangqi, the side that checks or chases on every move of a repetition loses. The app's own check catches <a class="act" href="#xq-repetition" data-line="check" data-move="5">perpetual check</a>. It does not try to catch <a class="act" href="#xq-repetition" data-line="chase" data-move="11">perpetual chase</a>, which needs to know what is attacked and what is protected. Pikafish judges both, through a command the build exposes but only a test calls so far.

## Reviewing a game

<figure class="fig wide" id="xq-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>A game between the app's Easy and Medium levels, reviewed by Pikafish at depth 16 with the app's review code, opened on the move that decided it.</figcaption>
</figure>

The game is between two of the app's own levels rather than a famous one, for a reason. The app once shipped ten "classic games" credited to grandmasters, and they were made up. The review is what gave them away, at 20 to 28% accuracy where random moves score 7%.
