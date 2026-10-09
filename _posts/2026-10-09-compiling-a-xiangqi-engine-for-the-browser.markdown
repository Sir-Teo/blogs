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

Xiangqi, or Chinese chess, has a world-class open-source engine in Pikafish, a fork of Stockfish with a xiangqi board and its own neural network. web-xiangqi is the third of my browser analysis apps, after [web-katrain]({{ '/2026/10/09/putting-katago-in-a-browser-tab.html' | relative_url }}) and [web-chess]({{ '/2026/10/09/grading-chess-moves-in-a-browser-tab.html' | relative_url }}), and the only one that builds its own engine. web-chess installs a ready-made Stockfish from npm. web-xiangqi's first commit, on February 25, was a reproducible build of Pikafish for WebAssembly with a smoke test, and the app grew around it.

Seven months and 1,339 commits later it is about 31,000 lines of TypeScript. It has 153 unit test files and another 157 test scripts, most of them driving a real browser or the engine. This post covers the parts that were interesting to build: the rules, the notation, the compile, the download, and two places where xiangqi's rules reach into the engine in ways chess never does. Two kinds of figures follow. The ones that let you move pieces run web-xiangqi's own rules and notation code, compiled for this page. The rest show output from Pikafish, the exact build the app ships, run offline in Node.

## The rules, in under 400 lines

Xiangqi is played on the points of a 9 × 10 grid, with a river across the middle and a three-by-three palace at each end. Its pieces mostly feel familiar to a chess player, with a few twists. The general and his advisors never leave the palace. Elephants move two points diagonally and never cross the river. A horse steps one point straight and then one diagonally, and a piece on that first point blocks it. The cannon moves like a chariot (the rook) but captures by jumping over exactly one piece. And the two generals may never face each other down an open file. Figure 1 is a board running web-xiangqi's own rules.

<figure class="fig" id="xq-rules">
<figcaption>web-xiangqi's move validation, compiled for this page. Pick up a piece to see its moves: dots are legal, crosses are moves the piece's pattern allows but a rule refuses. Click a dot to play it; the record below names each move in the chosen notation.</figcaption>
</figure>

The figure has a few positions set up. <a class="act" href="#xq-rules" data-preset="horse">A horse with two legs blocked</a> loses four of its eight moves. <a class="act" href="#xq-rules" data-preset="elephant">An elephant</a> is stopped by a piece on its eye. <a class="act" href="#xq-rules" data-preset="cannon">A cannon</a> can take the chariot behind one screen but not the general behind two. And <a class="act" href="#xq-rules" data-preset="general">a horse standing between the generals</a> can't move at all, because any step it takes leaves the two generals facing.

The code is deliberately simple. To list a piece's moves, it tries all 90 points and keeps the ones `validatePieceMove` accepts. That function reads like the rulebook:

```ts
} else if (type === "N") {
    if (!((adf === 2 && adr === 1) || (adf === 1 && adr === 2))) return { ok: false, reason: "horse moves in an L" };
    const legFile = adf === 2 ? (mv.fromFile + sgn(df)) : mv.fromFile;
    const legRank = adr === 2 ? (mv.fromRank + sgn(dr)) : mv.fromRank;
    if (state[legRank][legFile]) return { ok: false, reason: "horse leg blocked" };
}
```

Every refusal carries a reason, and each reason has a sentence written for a beginner. That is what the crosses in Figure 1 show. A test drives the engine until it has seen every reason it can produce and checks that each one has its sentence.

A second implementation of the rules is a second chance to get them wrong, so the TypeScript is checked against Pikafish itself. *Perft* counts every legal move sequence to a fixed depth, and two correct move generators must agree exactly. From the starting position that is 44 moves, then 1,920 two-move sequences, then 79,666 three-move sequences. web-xiangqi's test checks those counts and six other positions against numbers taken from the engine's own `go perft`. The script that built this page checks them again against the compiled copy the figures run. One of the six positions holds a single soldier between the two generals. It was added after an experiment: with the facing-generals rule switched off entirely, every earlier position still reported identical counts.

## Writing the moves down

Xiangqi notation names a move by its piece, its file, a direction and a number, and the figure can write every move three ways. <a class="act" href="#xq-rules" data-preset="start" data-play="h2e2" data-style="chinese">Play the most common first move</a>, the central cannon. In Chinese it is 炮二平五: cannon, file two, *across* to file five. In the WXF's Latin transcription it is C2=5, and as coordinates it is `h2e2`.

Files are counted from each player's own right, so the same file is "two" for Red and "eight" for Black. Red writes its numbers in Chinese numerals and Black in Arabic digits. A move is 平 (=) along a rank, 進 (+) forward or 退 (−) back. The final number depends on the piece. For pieces that move diagonally (horse, elephant, advisor) it is the file the piece lands on. For pieces that move straight (chariot, cannon, soldier, general) it is how far the piece travels forward or back. When two of the same piece share a file, they are told apart as front and rear. <a class="act" href="#xq-rules" data-preset="stack">With two chariots on one file</a>, the front one moving up three is 前俥進三, or +R+3.

web-xiangqi reads notation the lazy way, which turns out to be the robust way. To read a move someone typed, it generates every legal move in the position, writes each one out in WXF and in Chinese, and keeps the one that matches. It folds in the variants people actually type first: simplified characters, 包 for the cannon, a full stop for =, full-width digits. A notation the app can write is therefore a notation it can read. A test also checks that no two legal moves are ever written the same way.

For a beginner the characters are the hard part. 仕 and 士 are both advisors, and 相 and 象 both elephants, one character for each side. So the app can <a class="act" href="#xq-rules" data-pieces="letters">draw WXF letters on the pieces</a> instead. The K on the board is then the K in K5+1.

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
<figcaption>The build. One patched source tree becomes four cores, chosen at load time by what the browser supports. The network ships beside them, and it is almost all of the download.</figcaption>
</figure>

Pikafish is a command-line program. It reads UCI commands from standard input in a loop and prints its answers, and a web page has no standard input to block on. The heart of the 340-line patch turns it into a library. Under Emscripten, `main` builds the engine and returns instead of entering the loop, the loop's body becomes `process_command`, and the build exports one entry point that runs a single command:

```cpp
#ifdef __EMSCRIPTEN__
extern "C" void command(const char* cmd) {
    uciP->process_command(cmd);
}
#endif
```

The rest of the patch teaches the threading code to live without a thread in the single-threaded builds. That means stubbed native threads, jobs that run inline, and no binding threads to NUMA nodes. The build script compiles four cores: with and without threads, each with and without SIMD. The JavaScript wrapper picks one at load time by testing what the browser supports. It checks for shared memory first, then for SIMD with a 15-byte WebAssembly module that uses a SIMD type.

The toolchain is pinned as carefully as the source. Emscripten 6.0.2 dropped an option the wrapper relies on to tell each thread where the engine's code lives. Because the engine boots inside a worker, every thread it spawned became a `new Worker(undefined)`. The threaded cores answered `uci` and then never answered `readyok`, and nothing failed loudly. Assertions were off in the release build, and the Node tests never reach that code path. Threads have a second trap of the same kind. The cores are built with a pool of 12 threads, and asking for more than the pool holds blocks forever inside `pthread_create`. So the app never asks for more than 8, and a contract check fails if the pool and the app's limit drift apart.

## Fifty-three megabytes

The cores are small. The neural network is not: `pikafish.nnue` is 53.7 MB, and before the app learned to load the engine only when you open analysis, it was 97.6% of a first visit. Three details made it bearable.

**It streams with a progress count.** A bare "Loading engine" is indistinguishable from an engine that is never coming, especially on a phone connection where the wait runs to a minute. The wrapper reads the response body chunk by chunk into a buffer sized from `Content-Length`, so the status line can read "Loading engine · 21 of 51 MB". The buffer is then handed to Emscripten's in-memory file system without another copy. A second 53 MB copy is a real cost on the devices least able to afford it.

**Compression makes it bigger.** The file is already Zstandard-compressed, and GitHub Pages serves it gzipped at 53,728,090 bytes, 8,780 more than the file itself.

**The browser's HTTP cache won't keep it.** Browsers decline to cache a single response that large, so the 710 KB core came from cache on a second visit while the weights downloaded again in full every time. The same service worker that makes the page cross-origin isolated now keeps the network in Cache Storage. It revalidates on every load and serves the stored copy only when the server answers "not modified".

Isolation matters more here than anywhere else. GitHub Pages can't send the two headers that unlock `SharedArrayBuffer`, so without the service worker every visitor gets the single-threaded core. web-xiangqi's architecture notes measured both on the same machine and the same position. Single-threaded, Pikafish searched 414,000 nodes a second and its live analysis settled at depth 16. With eight threads it searched 3.7 million and reached depth 22: nine times the nodes and six more plies, from two response headers. One bug kept that loss alive for returning visitors. The page reloaded itself once the service worker was ready, using `navigator.serviceWorker.ready`. On a return visit that promise resolved against an old worker left over from an earlier demo. The reload fetched a page that still lacked the headers, and the guard that allows only one reload was spent on it. In the notes' words, everyone who had used the site before "stayed single-threaded, silently and permanently". It now reloads on `controllerchange`, when the new worker actually takes over.

## A clock nobody reads

A FEN, the one-line text format for a position, ends with a halfmove clock: how many plies have passed without a capture. Chess uses it for the fifty-move rule. Xiangqi's equivalent is a sixty-move rule, 120 plies, and Pikafish enforces it. So that field, which looks like the one nobody reads, changes the engine's verdict.

<figure class="fig" id="xq-clock" style="--reserve: 360px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>The same position searched by Pikafish at depth 14 for every value of the halfmove clock from 0 to 120. Only that one field of the FEN changes. Blue bars are a forced mate.</figcaption>
</figure>

<a class="act" href="#xq-clock" data-position="0" data-clock="115">At a clock of 115</a>, a horse and two advisors, with their general's help, force mate in three. Mate in three is five plies, and 115 plus five is 120, just in time. <a class="act" href="#xq-clock" data-position="0" data-clock="116">One ply later</a> the mate no longer fits, and the same position is 0.00. <a class="act" href="#xq-clock" data-position="1" data-clock="40">A won ending without a quick mate</a> behaves differently. A chariot against an advisor and an elephant reads between three and six pawns up for most of the clock, wobbling from one value to the next as the search changes shape. It sags to <a class="act" href="#xq-clock" data-position="1" data-clock="107">two pawns at 107</a> and is <a class="act" href="#xq-clock" data-position="1" data-clock="108">0.00 from 108</a>, because Pikafish can see it won't convert in the plies that are left.

For a while web-xiangqi wrote a flat `0` into every FEN it produced and dropped the clock from any FEN it was given. A game played from the opening never noticed, because the engine counts its own plies from the moves. A pasted endgame with a clock of 119, though, showed mate and a 100% chance of winning for a position the engine would call a draw. The clock is now carried through. It is also derived the way Pikafish derives it, including a detail where checks beyond the first ten by either side, and the replies to them, don't advance the clock.

## Repetition, where xiangqi differs most

In chess, a position repeated three times is a draw. In xiangqi it depends on *what the repeating moves were doing*. A side that checks on every move of the cycle loses unless it stops. So does a side that perpetually chases an unprotected piece. If neither side forces it, the game is drawn.

<figure class="fig" id="xq-repetition" style="--reserve: 400px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>Two repeating lines, and two verdicts after each move: web-xiangqi's own repetition check, running in this page, and Pikafish's rule judge, recorded from the engine. Pikafish's judge was called through a command web-xiangqi's patch adds.</figcaption>
</figure>

<a class="act" href="#xq-repetition" data-line="check" data-move="5">In the first line</a> Red's chariot checks on every move, and the general steps up and down to escape. web-xiangqi notices as soon as the position comes round a second time. It reads each move's check flag, sees that Red checked throughout the cycle, and says Red has to vary. <a class="act" href="#xq-repetition" data-line="check" data-move="9">By the third time round</a> Pikafish rules the same way.

<a class="act" href="#xq-repetition" data-line="chase" data-move="11">In the second line</a> nobody gives check. Red's chariot chases an unprotected horse back and forth, and by the rules Red loses for it. Pikafish knows that. web-xiangqi's own check deliberately doesn't try: deciding whether a move *chases* means knowing which piece is attacked, whether it is protected, and a handful of exceptions for pinned pieces and for chasing with a general or a soldier. Its source says, "Guessing at that would be worse than saying nothing." So it reports a repetition that is drawn *unless a chase is involved*. With the cloud book switched on, it asks chessdb.cn's rule service to judge the cycle. That switch is off by default, because it is the one feature that sends anything off the machine.

The patched engine can already judge chases. The build exposes Pikafish's own judge as a `rulejudge` command, which is how Figure 4 gets its second verdict, but so far only a test calls it.

## Reviewing a game

The review works like web-chess's: score every position, convert scores to winning chances, and grade each move on both centipawns and winning chances, taking the milder of the two. The winning-chance curve is Lichess's chess curve. The app says plainly that this is a heuristic, not a calibrated xiangqi probability, and it uses the same curve for the evaluation bar beside the board so the two can never disagree.

<figure class="fig wide" id="xq-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-xiangqi-demo.json' | relative_url }}">
<figcaption>A game between web-xiangqi's Easy and Medium opponents, reviewed by Pikafish at depth 16 with the app's own review code. The graph is Red's winning chances on the eval bar's curve; dots mark inaccuracies and mistakes. Every move can be read in any of the three notations.</figcaption>
</figure>

The game was played by the app's own opponent levels, with a fixed random seed. Easy searches to depth 4 and picks among its top four lines within three pawns, weighted toward the best. Medium searches to depth 6 and picks among three lines within 1.4 pawns. The searches ran without the app's time limits, so a rerun plays the same game. It stays level for 55 plies. Then <a class="act" href="#xq-review" data-move="64">both sides start giving things away</a>: Black's 32…士5進6 and Red's reply 33.兵三平四 each cost more than 20 points of winning chances. It settles back to level, until <a class="act" href="#xq-review" data-move="89">45.帥五進一</a>, Red's general stepping up off its back rank. That move takes Red from 43% to 17%, and Black mates eleven plies later.

Figure 5's game was generated rather than taken from a book, and that is deliberate. web-xiangqi once shipped ten "classic games" credited to named grandmasters, with events and dates. They weren't those games. Seven of the ten shared the same eight-move block, a block that leaves both chariots facing each other on an open file. Two contained illegal moves and had been loading silently truncated. What exposed them was the review: 20 to 28% accuracy and seven to ten blunders each, against 7% for a control of random moves. The list is empty now, entries need a source, and a calibration script reviews an engine self-play game and fails if it scores below 70%.

## What I would tell myself in February

- **Pin the toolchain, not just the source.** A patch release of the compiler broke threads without a single error. The pinned commit was only half of a reproducible build.
- **Test the deployment, not the dev server.** The dev server sends the isolation headers and GitHub Pages doesn't. The first performance measurements described a configuration no player ever loaded.
- **A passing check can hide a broken feature.** For a while every review search was stopped two milliseconds after it started, by live-analysis code that saw a search begin while a review was running and stopped it. Reviews still separated engine play from random moves, so the calibration check passed throughout. Once fixed, eleven searches took four seconds instead of 293 milliseconds and reached depth 16 instead of 5 to 10.
- **Don't trust data you didn't generate.** The fake classic games looked plausible until a tool the app already had was pointed at them.

If you play xiangqi, or want to learn it, [open web-xiangqi](https://sir-teo.github.io/web-xiangqi/), switch the pieces to letters, and play the central cannon.
