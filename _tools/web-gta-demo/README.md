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

- Streaming at 70 m/s with the figure's toy loop: no holds with 2.0 s windows,
  holds from 2.1 s.
- Braking at cruise 20, cars 4.8 long: stop below a 5.9-unit gap, crawl at 1
  from 5.9 to 7.9, stop from 7.9 to 8.9. So a follower stopped 8.5 behind stays
  put and one placed 7.5 behind creeps up to 5.9.

Numbers quoted from web-gta's docs, not measured here (drawn as static strips
inside the figures by `assets/js/web-gta.js`): the streaming-hold story
(1.3 to 1.9 s windows and 53 holds, then 60 to 350 ms and one hold), the census
(CENSUS.md, 2026-10-08) and the 46 vs 93 MB texture figure.
