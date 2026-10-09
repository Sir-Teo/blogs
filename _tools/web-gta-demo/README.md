# web-gta figure bundles

Builds the two scripts behind the figures in
`_posts/2026-10-09-porting-san-andreas-to-a-browser-tab.markdown` from the
port's own TypeScript:

- `core.ts` → `assets/js/web-gta-core.js` (about 8 KB): the region follower
  (`SceneRegionFollower`), `slowCarDownForOtherCar` from the CCarCtrl port,
  the adaptive-resolution controller, the DXT decoders and the touch-stick
  steering curve. None of these import three.js, Rapier or game data.
- `vm.ts` → `assets/js/web-gta-vm.js` (about 380 KB, 82 KB gzipped): the script
  decoder and `ScmThread`. It carries the port's command handlers and its
  opcode name table (generated from Sanny Builder's library), but the figure
  only runs core operations.

Run `./run.sh`. There is no data file. The figures' inputs (a straight road,
two box cars, made-up phones, one texture block, a hand-assembled script) are
written in `assets/js/web-gta.js`, and nothing from the game's data is bundled
or shipped. The VM figure single-steps by giving `run()` a budget of one and
catching the interpreter's watchdog error.

## Prose tied to the bundles

These follow from the port's code, so they change only if that code does:

- Streaming at 70 m/s with the figure's toy loop: no holds up to 2.0 s per
  window, holds from 2.1 s, 17.9 s held at 3.0 s; looking ahead by loading time
  moves the cliff only to about 2.2 s (the look-ahead caps at 0.8 radius).
- Braking at cruise 20, cars 4.8 long: stop below a 5.9-unit gap, crawl at 1
  from 5.9 to 7.9, stop from 7.9 to 8.9, then proportional, capped at 0.615 of
  cruise.
- Adaptive resolution at 45 ms: GPU-bound 3.1 s → 85%, 33.3 s → 100%,
  36.3 s → 85%, next try 96.8 s; CPU-bound reverts at 6.1 s, retries at 66.4 s;
  the warming phone first steps down at 63.5 s.
- Steering: a third of the stick gives 22.2%.

Numbers quoted from web-gta's docs, not measured here: the chunking (1,943
chunks, Grove window 30.8 vs 80.4 MB, 5.6 vs 8.1 s), the streaming-hold story
(53 holds and 28.6 s down to one 1.4 s hold), the census (CENSUS.md,
2026-10-08), the pedestrian leak and freed-handle stories, and the texture
memory figures.
