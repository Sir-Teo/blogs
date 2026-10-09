# web-katrain demo data

Generators for `assets/data/web-katrain-demo.json`, which drives the figures in
`_posts/2026-10-09-putting-katago-in-a-browser-tab.markdown`. They import
web-katrain's engine source directly, so the numbers are what the app computes.

- `golden.ts`: KataGo's 5x5 golden position through web-katrain's parser,
  graph, input planes and post-processing (CPU backend, as the app's own
  golden test runs it).
- `selfplay.ts`: a 9x9 game the bundled network plays against itself, with a
  full MCTS search on every position. With probability `slip` a move is one of
  the search's lower-ranked candidates instead of its first choice; those are
  flagged `slip` in the data and labelled as planted in the post.
- `assemble.mjs`: merges both, picks the PUCT playground position and the
  review's starting move, and prints a summary.

Run `./run.sh` (see the header for arguments). Jekyll does not publish
folders starting with `_`, so none of this ships with the site.

## Prose tied to the shipped data

A rerun of `run.sh` produces a similar game, not the same one. These parts of
the post quote the current `web-katrain-demo.json` and need re-checking after
one:

- Figure 4's caption ("after move 20") and the paragraph after it: F6 is the
  network's favourite, H4 takes 89 of 100 playouts at c = 1, and F6 gets 26
  at c = 4. The links in that paragraph replay those settings.
- The swing paragraph: move 37 (Black J3, lost 14 points, a planted slip),
  with 15 points passing to White in the top right and 12 moving toward Black.
- The golden paragraph: four ownership values off by one permille, policy
  exact. This one only changes if web-katrain's engine does.
