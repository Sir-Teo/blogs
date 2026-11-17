---
layout: post
title: "Compiling a xiangqi engine for the browser"
series: engines
description: >-
  How web-xiangqi compiles Pikafish to WebAssembly, streams its 53.7 MB neural
  network from a static host, and implements xiangqi's blocking rules, notation,
  halfmove clock, and repetition laws in the browser.
image: /assets/social/compiling-a-xiangqi-engine-for-the-browser.png
date: 2026-10-09 12:00:00 -0400
excerpt: >-
  Pikafish, the strongest open-source xiangqi engine, compiled to WebAssembly
  and served from a static host. With playable boards for the rules that trip
  up chess players, and the story of ten grandmaster games that never happened.
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

Xiangqi, Chinese chess, looks familiar for about a minute. Then a horse can't move because a piece is standing next to it, a cannon jumps over a piece to capture, and a repeated position isn't a draw until you know who was forcing the repetition.

**web-xiangqi** is an analysis and game-review app built around Pikafish, the strongest open-source xiangqi engine: a C++ fork of Stockfish for a nine-by-ten board with a river across the middle and a palace at each end. I compiled Pikafish to WebAssembly and serve its 53.7 MB neural network from a static host. The boards below run the app's own rules and notation code, paired with evaluations from the Pikafish build the app ships.

## The rules

<figure class="fig" id="xq-rules">
<figcaption>web-xiangqi's own move validation for the piece picked up. Dots are legal; crosses are moves a rule refuses, and the piece in the way is ringed.</figcaption>
</figure>

Even if you play chess every day, four xiangqi rules will catch you out. Pick up each piece on the board above to see them:

- <a class="act" href="#xq-rules" data-preset="horse">A horse's leg can be blocked</a> by a piece on the straight step before its diagonal turn.
- <a class="act" href="#xq-rules" data-preset="elephant">An elephant's eye can be blocked</a> at the midpoint of its two-point diagonal, and elephants may never cross the river.
- <a class="act" href="#xq-rules" data-preset="cannon">A cannon captures by jumping exactly one piece</a>, but moves like a rook when it isn't capturing.
- <a class="act" href="#xq-rules" data-preset="general">The two generals may never face each other</a> on an open file.

Before the app sends a position to the engine, its own TypeScript move generator has to agree with Pikafish on every legal move. A `perft` test, which counts every legal sequence to a fixed depth, holds the two together: 44 moves from the starting position, 1,920 two-move sequences, and 79,666 three-move sequences, matched exactly.

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

Xiangqi notation reads like a four-character sentence rather than a square name, with files numbered 1 to 9 from each player's own right. In the classic central-cannon opening `炮二平五` (`C2=5` in World Xiangqi Federation letters), Red takes the cannon (`炮`) on file two (`二`) and slides it across (`平`) to file five (`五`). When a piece moves forward (`進`, `+`) or back (`退`, `−`), the last character changes meaning with the piece. For pieces that travel along a file, it counts steps. For pieces that move diagonally, like horses, elephants, and advisors, it names the file they land on.

You can <a class="act" href="#xq-rules" data-preset="start" data-play="h2e2">play `炮二平五` on the board above</a>, or <a class="act" href="#xq-rules" data-pieces="letters">switch the pieces to letters</a> if you're still learning the characters. (Red and Black even use different characters for the same piece, such as `仕` and `士` for advisors.) To read a move someone types, in Chinese, WXF letters, or engine coordinates, the app writes every legal move in the position in all three notations and keeps the one that matches. No parser can disagree with the move generator that way.

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

Pikafish is a command-line program that sits waiting on standard input for engine commands. A browser worker has no standard input to wait on, so the heart of my 340-line patch turns `main()` into setup code and exposes one C function that handles one command at a time:

```cpp
extern "C" void command(const char* cmd) {
    uciP->process_command(cmd);
}
```

The rest of the patch stubs out native threads for the single-threaded builds and removes NUMA node binding. The result is four WebAssembly cores of about 700 KB each, and the loader picks one at startup based on what the browser supports.

The compiler had to be pinned as tightly as the C++ source. Emscripten `6.0.2` quietly dropped a flag that told thread workers where the engine's script lived, so every thread it spawned became `new Worker(undefined)`. The engine would answer `uci` and then hang forever before `readyok`. Version `6.0.1` is pinned in the build.

Beside the 700 KB core sits `pikafish.nnue`, a 53.7 MB weight file that makes up 97.6% of a first visit's download. It's already Zstandard-compressed, so gzipping it on the server makes it 8.8 KB *larger*. Browsers won't keep a response that big in their ordinary HTTP cache, so the app's service worker stores the network in Cache Storage itself. The same service worker attaches the two cross-origin isolation headers GitHub Pages can't send, which is what unlocks threads: an eight-thread search runs at 3.7 million nodes a second, against 414,000 on one.

## The halfmove clock

<figure class="fig" id="xq-clock" style="--reserve: 360px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>One endgame, searched by Pikafish at depth 14 for every value of the FEN's halfmove clock. Blue is a forced mate.</figcaption>
</figure>

A position is passed to the engine as a FEN string, one line of text describing the board, and every FEN ends with a halfmove clock: the number of plies since the last capture. Where chess draws after 50 moves (100 plies) without a capture, xiangqi draws after 60 (120 plies), and Pikafish reads the counter straight from the FEN.

In the horse-and-advisor endgame above, mate in three takes five plies. So the forced mate is still there <a class="act" href="#xq-clock" data-position="0" data-clock="115">with the clock at 115</a> (115 + 5 = 120, mate on the last legal ply) and turns into a `0.00` draw <a class="act" href="#xq-clock" data-position="0" data-clock="116">at 116</a>.

Early versions of web-xiangqi wrote `0` into the clock of every FEN they sent and ignored the clock on pasted positions. Paste an endgame near the 60-move limit and the app would promise a forced mate the engine itself would have called a draw.

## Repetition

<figure class="fig" id="xq-repetition" style="--reserve: 400px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>Two repeating lines, judged after each move by web-xiangqi's own check and by Pikafish's rule judge.</figcaption>
</figure>

Repetition is where xiangqi breaks hardest from chess. Repeating a position three times isn't an automatic draw: the result depends on *who is forcing the loop*. A player who gives check on every move of a cycle loses unless they deviate, and so does a player who endlessly chases an unprotected piece.

The app's own TypeScript catches <a class="act" href="#xq-repetition" data-line="check" data-move="5">perpetual check</a> as soon as the cycle forms, since every recorded move already carries a check flag. It deliberately doesn't guess at <a class="act" href="#xq-repetition" data-line="chase" data-move="11">perpetual chase</a>. Deciding whether a move legally "chases" means knowing which piece became newly attacked, whether it's defended, and a tangle of exceptions for pinned pieces, generals, and soldiers. As the source comments put it, guessing would be worse than saying nothing. So the app calls an unverified loop a draw *unless a chase is involved*, and the WebAssembly patch exposes Pikafish's internal `rulejudge` command, which rules correctly on both lines above.

## Reviewing a game

<figure class="fig wide" id="xq-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>A game between the app's Easy and Medium levels, reviewed by Pikafish at depth 16 with the app's review code, opened on the move that decided it.</figcaption>
</figure>

The review scores every position at depth 16, turns each score into a winning chance, and grades each move by the milder of two losses: centipawns and winning chances. In the game above, play stays roughly level through a pair of mutual stumbles around <a class="act" href="#xq-review" data-move="64">move 32</a>. Then Red steps its general off the back rank with <a class="act" href="#xq-review" data-move="89">45.帥五進一</a>, drops from 43% winning chances to 17%, and walks into mate eleven plies later.

That game was played between two of the app's own levels, Easy and Medium, rather than taken from a book, and there's a reason. web-xiangqi once shipped ten "classic grandmaster games", complete with player names, events, and dates. None of them were real. Seven shared the same eight-move opening, and two contained illegal moves that had been silently cut short when they loaded.

The app's own review engine is what gave them away. The supposed grandmasters scored 20% to 28% accuracy with seven to ten blunders apiece, barely ahead of the 7% that random legal moves score. All ten are gone. The historical games list stays empty until there's a sourced collection whose games can be traced to real events.

It's the same rule as the perpetual-chase check and the halfmove clock: when the app can't verify something, it should say less, not guess.
