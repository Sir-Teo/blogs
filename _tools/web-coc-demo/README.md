# web-coc demo data

Generator for `assets/data/web-coc-demo.json`, which drives the figures in
`_posts/2026-10-09-replaying-a-village-raid.markdown`. `raids.ts` imports Crown
& Clan's `GameModel` and steps real battles at 0.05 s in Node.

- Only the project's own authored villages (the twelve `valley-v1` stages) are
  used. The JSON holds footprints, positions (tenths of a tile, delta-encoded),
  hit-point fractions, stars and destruction: no art, and no raw hit points or
  damage from the client tables the model reads.
- Sections: `raids` (one army from 12 landing points on Ember Keep, frames at
  2.5 Hz), `paths` (the exported `findPath` from 64 edge points to each troop
  type's preferred target), `sweep` (three armies against all twelve villages,
  from the west) and `det` (one raid stepped at 0.05 s and 0.1 s, a rerun, and
  a replay from the saved recording). `SECTIONS=raids,paths node ...` runs a
  subset.
- The campaign has no clock, so a raid whose troops stop damaging buildings for
  20 s is ended with `finishBattle()`, as a player would end it.

Run `./run.sh`. Battles are deterministic, so a rerun writes the same file.
The full model bundle carries the client's data tables, which is why the
figures replay recordings instead of running the simulation in the page.

## Prose tied to the shipped data

- Ember Keep: point 4 (northeast) is wiped out at 37%; point 6 takes three
  stars in 42 s. The raid figure opens on point 6.
- Routes: Giants go through a wall from 20 of 64 points; Barbarians from none.
- Sweep: the Air army three-stars villages 1–8, then falls off.
- Determinism: a 16 s raid recorded as 45 actions and 317 steps, under 10 KB.
