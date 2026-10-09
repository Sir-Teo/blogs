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

web-chess is the chess sibling of [web-katrain]({{ '/2026/10/09/putting-katago-in-a-browser-tab.html' | relative_url }}). You can play Stockfish, import a game, or have a game reviewed move by move, and the engine runs inside the browser tab with no server behind it. Chess already has excellent free tools, so this was less about the product than about two questions underneath it. How do you turn an engine's centipawns into a verdict a person will trust? And how do you make the strongest chess program in the world play like a beginner?

The project started on January 29 as an empty React board. Eight months and 1,349 commits later it is about 30,000 lines of TypeScript with 121 test files. This post covers the parts that were interesting to build. The figures are interactive. Two of them recompute as you drag, using web-chess's own grading code compiled for this page. The others show games that web-chess's review code graded offline, with the same Stockfish build the app ships running in Node at the app's default depth.

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
<figcaption>How the app is split. Each engine is a separate Stockfish in its own worker, spoken to in UCI, the text protocol chess engines use. The review pool exists only while a review runs.</figcaption>
</figure>

The engine is Stockfish 18, compiled to WebAssembly by the stockfish.js project. web-chess ships the Lite build: a 7 MB `.wasm` file with a small neural network baked in. It comes in a single-threaded flavour and a multithreaded one. The full-strength build is 113 MB, so it is offered from a CDN rather than bundled.

There isn't one engine, there are three kinds. The **analysis engine** follows whatever position is on the board. The **opponent** is a second Stockfish in its own worker. It runs with different settings (a strength limit, a different number of lines, usually one thread), and sharing one engine would mean stopping your analysis every time the opponent had to move. The **review pool** exists only while a review runs. Reviewing a game means searching every position in it, and those searches don't depend on each other, so a desktop can run several engines at once. Each engine gets a contiguous run of moves rather than every fourth one: neighbouring positions share most of their analysis, so an engine handed moves 1 to 9 keeps finding useful entries in its own hash table. On the Opera Game at depth 18, four single-threaded engines finished in 8.2 seconds against 16.5 for one. That is a 2.0× speedup.

### The headers you can't send

The multithreaded build needs `SharedArrayBuffer`. Browsers only expose it to a *cross-origin isolated* page, which takes two response headers, and GitHub Pages won't send custom headers. web-chess gets around this with its own service worker, which sits between the page and the network and adds the headers to every response on the way in. The same worker also caches the app for offline use, and it has to be the same worker: a second service worker at the same scope would replace the first and quietly drop the isolation. It caches the response *with* the added headers, so an offline load is still isolated. It only stores complete responses, because browsers fetch a 7 MB `.wasm` with range requests and Cache Storage refuses a partial one.

For a while none of this mattered, because the multithreaded engine never actually ran. Every engine boots through a small bootstrap script. An exemption list wrapped every build in it except the multithreaded one, and that build's threads died at startup. The analysis panel caught the error and fell back to the single-threaded build without saying so, and the fallback's own message overwrote the one explaining why. Once the bootstrap was fixed, the same position at depth 16 went from 443,000 to 3.5 million nodes a second. The opponent had no fallback at all, so on an isolated desktop it simply never moved. Both bugs hid for the same reason: a silent fallback looks exactly like working software.

Figure 2 runs the functions web-chess uses to size itself to a device, starting from what this browser reports.

<figure class="fig" id="wc-device">
<figcaption>What web-chess sets up on a device like this one, from the app's own sizing functions. The inputs start from this browser; change them to see another machine. Numbered cells are review engines; the queue shows which of the Opera Game's 33 positions each one takes.</figcaption>
</figure>

<a class="act" href="#wc-device" data-device="phone">On a phone</a> everything stays small: one single-threaded engine, a 16 MB hash table and one line of analysis, because a second line costs between two and four and a half times the work, not twice. <a class="act" href="#wc-device" data-device="laptop">A four-core laptop</a> gets three threads in one engine and reviews with that same engine, because the pool wants at least two threads for every engine it adds. <a class="act" href="#wc-device" data-device="desktop">An 18-core desktop</a> runs four review engines with two threads each. <a class="act" href="#wc-device" data-device="pages">Without isolation</a> the same desktop falls back to the single-threaded build, but the review pool still runs four engines: separate engines share no memory, so they don't need `SharedArrayBuffer`.

## From a score to a verdict

Stockfish reports a position's value in *centipawns*, hundredths of a pawn. That is the right unit for searching and the wrong one for judging a person. Giving up a pawn in a level position can decide the game. Giving up a pawn when you are already a rook ahead changes almost nothing. So web-chess grades moves on *winning chances*, using the curve Lichess published for its accuracy score:

```ts
// Lichess's win-percentage model: the chance the side the score belongs to
// goes on to win.
const WIN_PERCENT_CP_LIMIT = 2000
const WIN_PERCENT_CP_SLOPE = 0.00368208

export function winPercentFromCp(cp: number): number {
  const limited = Math.max(-WIN_PERCENT_CP_LIMIT, Math.min(WIN_PERCENT_CP_LIMIT, cp))
  const raw = 50 + 50 * (2 / (1 + Math.exp(-WIN_PERCENT_CP_SLOPE * limited)) - 1)
  return Math.max(0, Math.min(100, raw))
}
```

Each move is judged twice: once by the centipawns it gave up and once by the winning chances it gave up. Both readings go on a ladder from Excellent to Blunder. The winning-chance ladder isn't a set of round numbers; it is the centipawn ladder converted at a level position. So the two readings agree when the game is balanced and only part company as it becomes lopsided. The review then reports the milder of the two. Figure 3 is that rule.

<figure class="fig" id="wc-grade" style="--reserve: 330px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>One move, graded. The curve maps the engine's score to winning chances for the player who moved; <em>before</em> and <em>after</em> are the position before the move and after it. Both ladders and the verdict are computed by web-chess's own functions.</figcaption>
</figure>

<a class="act" href="#wc-grade" data-before="0" data-after="-300">Drop three pawns from a level position</a> and both ladders say Blunder: winning chances fall from 50% to 25%. <a class="act" href="#wc-grade" data-before="1000" data-after="700">Drop the same three pawns at +10</a> and the centipawn ladder still says Blunder, but winning chances only move from 97% to 93%, so the review calls it Good. Real games produce the same split. <a class="act" href="#wc-grade" data-game="opera" data-ply="28">In the Opera Game, 14…Qe6</a> gave up 1.7 pawns. Black was already lost, though, so it cost 4.3 points of winning chances and is graded Good. <a class="act" href="#wc-grade" data-game="opera" data-ply="30">Its 15…Nxd7</a> walks into a forced mate. A mate has no centipawn value, so the engine reports it as a sentinel of 100 pawns, and the raw reading says Black threw away 90 of them. The winning-chance reading sees a lost position becoming lost a little faster.

That sentinel used to leak elsewhere too. The Opera Game's review once reported an average centipawn loss of 316 beside "Mistakes 0, Blunders 0". The mate had entered the average at full size, so any single move's loss is now capped at ten pawns before averaging.

Two labels sit outside the ladder. **Best** means the move *is* the engine's choice, whatever the arithmetic says. A move is graded from two separate searches, one before it and one after, and at a fixed depth those disagree by a few dozen centipawns as a matter of course. Without that rule, the engine's own recommendation could be called an inaccuracy on the same row that names it the best move. **Book** marks moves that keep the game inside a table of named openings, unless the engine faulted them: being in the book is not an answer to "was it a mistake?".

## One number for a game

Every move also gets an accuracy, from another Lichess curve over the winning chances lost:

```ts
accuracy = 103.1668 * Math.exp(-0.04354 * winPercentLost) - 3.1669 + 1  // clamped to 0..100
```

The obvious way to turn forty of those into one number is to average them. Lichess's own documentation says not to, and web-chess spent its first seven months doing it anyway. A single blunder in an even game gets diluted by every quiet move around it, and the quiet moves in a decided game count as if the player had to find them. The current method has two halves. The first weights each move by how volatile the game was around it: the standard deviation of winning chances over a window of nearby positions. A move played while the game swings counts for more than one played in a dead rook ending. The second half is the harmonic mean, which the worst move dominates. Game accuracy is the average of the two.

<figure class="fig" id="wc-accuracy" style="--reserve: 300px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Per-move accuracies for one player, and the four ways to sum them up. Drag a bar to change a move. The grey strip under each bar is its weight. The game accuracy (blue) is web-chess's <code>aggregateAccuracy</code>.</figcaption>
</figure>

<a class="act" href="#wc-accuracy" data-set="one">Thirty-nine moves at 95 and one blunder at 9.5</a> average 92.9, which reads as a fine game. The harmonic mean drags it to 77.6, and the game accuracy lands at 85.2. Drag the blunder up to 60 and the gap closes almost entirely: the harmonic mean only punishes a move that is truly bad. <a class="act" href="#wc-accuracy" data-set="opera-b">Black's moves in the Opera Game</a> show the weighting at work: the quiet opening moves carry little weight, and the moves played while the position collapsed carry the most.

## Reviewing a game

Figure 5 puts it together. Each game was searched position by position at depth 16, the app's default, with the single-threaded Lite build. The positions were read with the review pool's own parser and graded by the same `buildReviewRows` function the app calls, with the opening table wired in. The first game is the Opera Game, played in a box at the Paris opera in 1858. The second is a game between two of web-chess's own opponent levels, played with the app's settings.

<figure class="fig wide" id="wc-review" style="--reserve: 640px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Two games as web-chess reviews them: Stockfish 18 Lite at depth 16, graded by the app's review code. The graph is White's winning chances from the score; dots mark inaccuracies, mistakes and blunders. The badge on the board grades the move just played, and the green arrow is the engine's choice for the side to move.</figcaption>
</figure>

<a class="act" href="#wc-review" data-game="opera" data-move="6">In the Opera Game</a>, annotators usually fault 3…Bg4 for handing White the bishop pair. At depth 16 it costs 0.4 pawns and is graded Good. Black's two worst moves by the review are <a class="act" href="#wc-review" data-game="opera" data-move="12">6…Nf6</a> and <a class="act" href="#wc-review" data-game="opera" data-move="20">10…cxb5</a>, both Inaccuracies. After the second one, White is four pawns up in the engine's eyes, and nothing in the famous finish costs Black much more by this measure. The moves are bad, but the position was already gone. Morphy scores 99.4, his opponents 90.4.

The second game was played by two of web-chess's levels, Club as White and Intermediate, the default, as Black. Each move was chosen with the app's own settings and the app's own move-picking code. Black was better for most of the game, and <a class="act" href="#wc-review" data-game="club" data-move="37">after 19.Nxf6+</a> White was down to a 16% chance. Then <a class="act" href="#wc-review" data-game="club" data-move="38">19…Kf8</a> stepped away from the check instead of taking the knight. That one move gave up 8.6 pawns and 66 points of winning chances, the only Blunder in either game. <a class="act" href="#wc-review" data-game="club" data-move="41">Two moves later</a>, 21.Qxg3 wins Black's queen and is still graded a Mistake: 21.fxg3 also took the queen and kept a forced mate on the board, which the review counts as 14.5 points of winning chances given away.

## Playing badly on purpose

A sparring partner is the other half of studying. Stockfish has a built-in strength limit: set `UCI_LimitStrength` and a `UCI_Elo` and it weakens its own play to match. web-chess's levels run from Beginner at 1,320, the lowest Elo the engine accepts, to Master at 2,600, with Maximum switching the limit off. The levels below Maximum also get one thread, because an Elo-capped search doesn't get stronger with more cores. It would just burn eight of them to keep playing like a 1,320.

Even at 1,320 the engine plays like a club player, so the two weakest levels add variety of their own. They used to do it by playing a uniformly random legal move 38% and 20% of the time. No human beginner plays like that, and a learner can't learn anything from it. Now the opponent asks for four lines instead of one, and when it varies, it picks among the other lines that are no more than 1.8 pawns (Novice: 0.9) worse than its first choice.

<figure class="fig" id="wc-variety" style="--reserve: 420px" data-src="{{ '/assets/data/web-chess-demo.json' | relative_url }}">
<figcaption>Every legal move in a position, best first, by what it costs, and where each rule's choices go. Move costs come from a full-strength depth-14 search of all legal moves; colours are the review's labels, and the shaded band is the four lines the current rule chooses from. To isolate the variety rule, the figure treats the best move as the engine's first choice; at these levels the Elo limit makes that choice weaker as well. The table repeats the comparison over every position in both games.</figcaption>
</figure>

<a class="act" href="#wc-variety" data-level="1" data-position="8">Here is Beginner</a> in the Opera Game after 4…Bxf3. White has to take the bishop back, and 33 of its 35 legal moves lose three pawns or more. The old rule played any legal move 38% of the time, so here it gave material away more than a third of the time; that is the top bar. The current rule only varies between the two recaptures, Qxf3 and gxf3, in the bottom bar. Across all 90 positions in both games, the old Beginner gave up 1.5 pawns a move on average and lost three or more on 17.5% of its moves, about one move in six. The current Beginner gives up 0.16 pawns a move and never loses three. <a class="act" href="#wc-variety" data-level="2">Novice</a> varies less often and within a narrower window, and gives up 0.05.

Playing against the engine also has a quieter feature. When your move gives up a lot, web-chess says so while you can still take it back: "Qh5 looks like a blunder: it gave up about 3.0 pawns". It costs no extra search, because the opponent has already done the work. Its search before its own move ended with a reading of the position, and its search after your reply starts with one, so the gap between the two is what your move cost:

```ts
const before = scoreToCp(previous.cp, previous.mate) // engine's view, before its own move
const after = scoreToCp(current.cp, current.mate)    // engine's view, after your reply
const deltaCp = before - after
const winPercentLoss = Math.max(0, winPercentFromCp(-before) - winPercentFromCp(-after))
if (deltaCp >= 0) return null
const quality = qualityForLoss(deltaCp, winPercentLoss) // the review's own ladder
if (quality !== 'mistake' && quality !== 'blunder') return null
```

There is a subtlety that makes this safe. The first reading is the engine's *best* line. If a weak level then deliberately played something worse, your true loss is bigger than the measured gap, not smaller. So the nudge can miss a mistake, but it can't invent one.

The clock needed the same kind of care. At Maximum the opponent spent a fixed two seconds a move, so on a one-minute clock it flagged itself around move thirty. It now thinks for a thirtieth of its remaining time plus most of the increment, which shrinks as the clock runs down instead of running out. An engine-against-engine game at one minute each now reaches move 47 with seven seconds left on both clocks.

## What I would tell myself in January

- **A silent fallback is worse than a failure.** The multithreaded engine was broken and nothing said so, because the fallback worked. The engine panel now says what it fell back from and why.
- **Grade what the player can lose, not what the engine counts.** Centipawns are the engine's currency. A person loses games, and winning chances are the closest the engine has to that.
- **Give each purpose its own engine.** Analysis, the opponent and the review each want different options, and sharing one engine means constantly re-sending them. That costs more than it looks: re-sending `Hash`, even with the same value, clears the table.
- **Measure five times.** One change once measured as a 37% speedup. Five runs each way showed it was slower, and the change was reverted.

If you play chess, [open web-chess](https://sir-teo.github.io/web-chess/), import a game you lost, and press Review.

<p class="credit">Piece artwork in the figures is Colin M.L. Burnett's set, as drawn by react-chessboard in the app.</p>
