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

- Grading: 15…Nxd7 (walking into mate, already lost) is graded Good.
- Review: the figure opens on the club game's 19…Kf8, the only Blunder
  (66 points of winning chances); the Opera Game's worst moves are
  Inaccuracies.
- Weak levels: after 4…Bxf3, 33 of 35 moves lose 3+ pawns; over 90 positions
  the old Beginner lost 3+ pawns on 17.5% of moves, the current one never.
- The accuracy figure's 85 vs 93 only changes if web-chess's formulas do.

Numbers quoted from web-chess's own docs rather than measured here: the
2.0× review pool speedup (Opera Game, depth 18), 443k vs 3.5M nodes a second
for the threading fix, ACPL 316, the 37% speedup that five runs disproved, and
move 47 with seven seconds left at 1+0.
