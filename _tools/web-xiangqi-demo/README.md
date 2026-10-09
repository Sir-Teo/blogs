# web-xiangqi demo data

Generators for `assets/data/web-xiangqi-demo.json` and
`assets/js/web-xiangqi-core.js`, which drive the figures in
`_posts/2026-10-09-compiling-a-xiangqi-engine-for-the-browser.markdown`. They
use web-xiangqi's own source and the Pikafish build it ships (`dist/`), run in
Node through the repo's own loader.

- `core.ts`: rules, notation, piece labels, the winning-chance curve and the
  repetition check, bundled as an IIFE, `window.WebXiangqiCore`.
- `perft.mjs`: checks that bundle against Pikafish's own `go perft` counts
  (the cases web-xiangqi's `perft.test.ts` pins). `run.sh` stops if it fails.
- `pikafish.cjs`: boots Pikafish in Node and waits for output correctly
  (replies can arrive synchronously inside `postMessage`; threaded cores need a
  keepalive timer).
- `game.ts`: plays a game between two of the app's opponent levels
  (`getAiSearchConfig`, `chooseAiMoveFromPv`, seeded) with `go depth` only, then
  reviews it at depth 16 with `computeReviewArtifacts`, plus three lines per
  position for the candidate list. The app adds time limits; leaving them out
  makes a rerun play the same game.
- `clock.cjs`: one endgame searched at depth 14 for every halfmove clock 0-120.
- `repetition.cjs`: two repeating lines judged after each move by Pikafish's
  `rulejudge` (a command web-xiangqi's patch adds; the app only uses it in a
  test).
- `threads.cjs`: time to depth by thread count. Not used by the post: one run
  per count on an 8-core M1 was too noisy, so the post quotes the app's own
  browser measurements instead.
- `assemble.mjs`: merges the outputs and prints the numbers the post quotes.

Run `./run.sh` (see its header). Every search is single-threaded at a fixed
depth, so a rerun reproduces the shipped JSON exactly except `game.gradeMs`,
the wall-clock time of the grading pass (checked 2026-10-09).

## Prose tied to the shipped data

- Clock figure: mate in 3 through clock 115, 0.00 from 116 (horse ending).
- Repetition figure: the app reports the perpetual check at move 5; Pikafish
  rules against Red in both lines from move 9.
- Review: the figure opens on the move that lost the most winning chances,
  45.帥五進一 (ply 89).

Numbers quoted from web-xiangqi's docs rather than measured here: 414k vs
3.7M nodes a second and depth 16 vs 22 with and without isolation, 97.6% of a
first visit, the fake classic games' 20-28% accuracy, and the review that was
stopped after 2 ms.
