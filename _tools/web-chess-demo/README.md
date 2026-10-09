# web-chess demo data

Generators for `assets/data/web-chess-demo.json` and `assets/js/web-chess-core.js`,
which drive the figures in
`_posts/2026-10-09-grading-chess-moves-in-a-browser-tab.markdown`. They import
web-chess's own source, so the numbers are what the app computes.

- `core.ts`: the grading and sizing functions the figures recompute live
  (winning chances, move accuracy, labels, game accuracy, engine profile,
  threads, hash, review pool). Bundled as an IIFE, `window.WebChessCore`.
- `review.ts`: reviews PGNs with Stockfish 18 Lite (the single-threaded WASM
  build the app ships, from web-chess's `node_modules/stockfish`) in Node.
  Positions are read with the review pool's `snapshotFromSearchLines` and
  graded by `buildReviewRows` with the ECO table as the opening book. Also
  scores every legal move of every position (MultiPV = legal moves) for the
  weak-levels figure.
- `play.ts`: plays a game between two of the app's opponent levels with the
  app's own settings (`aiDifficultyCommands`, `aiMultiPv`, `aiMovetimeMs`,
  `pickVarietyMove`). Stockfish's strength limit is not seedable, so the post's
  game is kept in `games/club-vs-intermediate.pgn` (seed 5, chosen from about
  twenty games for having a clear turning point).
- `assemble.mjs`: names the games, picks the weak-levels figure's first
  position, and prints the numbers the post quotes.
- `pieces.cjs`: writes the board's piece artwork (Cburnett's set, as
  react-chessboard draws it) into `assets/js/web-chess.js`. Run once.

Run `./run.sh` (see its header). Jekyll does not publish folders starting with
`_`, so none of this ships with the site.

## Prose tied to the shipped data

Single-threaded fixed-depth search repeats exactly, so a rerun of `run.sh`
gives the same numbers. These parts of the post quote them:

- The grading paragraph: 14…Qe6 (−171 cp, 4.3 points, Good) and 15…Nxd7
  (mate sentinel, Good).
- The accuracy paragraph: 92.9 / 77.6 / 85.2 for the synthetic set, which only
  changes if web-chess's formulas do.
- The review paragraphs: 3…Bg4 Good (0.4 pawns), 6…Nf6 and 10…cxb5 the
  only Inaccuracies, White four pawns up after 10…cxb5, accuracy 99.4 / 90.4;
  in the club game 19.Nxf6+ leaves White at 16%, 19…Kf8 is the only Blunder
  (8.6 pawns, 66 points), 21.Qxg3 a Mistake that lets a mate go (14.5 points).
- The weak-levels paragraph: after 4…Bxf3, 33 of 35 moves lose 3+ pawns;
  over all 90 positions the old Beginner loses 1.5 pawns a move and 3+ pawns on
  17.5% of moves, the current one 0.16 and 0%; Novice 0.05.

Numbers quoted from web-chess's own docs rather than measured here: the
2.0× review pool speedup (Opera Game, depth 18), 443k vs 3.5M nodes a second
for the threading fix, ACPL 316, the 37% speedup that five runs disproved, and
move 47 with seven seconds left at 1+0.
