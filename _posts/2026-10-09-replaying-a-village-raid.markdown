---
layout: post
title: "Replaying a village raid"
description: >-
  How Crown & Clan, a village-raiding strategy game in the browser, keeps its
  battle simulation apart from the screen, deterministic to the bit, and
  replayable across fifty versions of its own rules.
date: 2026-10-09 13:00:00 -0400
excerpt: >-
  A village-raiding strategy game in the browser, with the battle simulation
  kept off the screen, deterministic to the bit, and replayable across fifty
  versions of its own rules.
links:
  - title: Live game
    url: https://coc.teozeng.dev
  - title: Source
    url: https://github.com/Sir-Teo/web-coc
styles:
  - /assets/css/web-coc.css
scripts:
  - /assets/js/web-coc.js
---

Crown & Clan is a village-building and raiding game in the mould of Clash of Clans, running entirely in the browser. You build a village, train an army, raid 150 single-player villages and watch the replays. Saves stay in the browser; there is no server and no account. It is built with TypeScript and Phaser. It started on September 10, and 601 commits later it is about 66,000 lines of TypeScript.

It is also a fan project, and its README says so plainly: "This is an independent educational fan project. Clash of Clans assets and trademarks belong to Supercell." So this post draws its own pictures. Every battle in the figures below was simulated by the game's own engine, stepped at 20 Hz in Node, on the twelve villages the project authored itself. The troop statistics underneath come from the original game's tables. The figures show positions, footprints and how much health each building has left, drawn as plain shapes.

## A simulation with no screen

<figure class="fig">
<svg class="arch" viewBox="0 0 680 262" role="img" aria-label="Architecture: player input and recorded actions go into GameModel, a pure TypeScript simulation stepped at 20 Hz; a Phaser scene draws interpolated positions and a DOM HUD reads the model; saves go to IndexedDB and localStorage, and each raid is recorded as a setup, step sizes and actions.">
<defs>
<marker id="coc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="24" y="30" width="170" height="52" rx="6"/>
<text class="t" x="109" y="48">Your taps</text>
<text class="st" x="109" y="65">deploy, spell, end</text>
<rect class="box" x="24" y="104" width="170" height="52" rx="6"/>
<text class="t" x="109" y="122">A recording</text>
<text class="st" x="109" y="139">the same actions, replayed</text>
<rect class="box em" x="252" y="56" width="176" height="76" rx="6"/>
<text class="t" x="340" y="80">GameModel</text>
<text class="st" x="340" y="98">pure TypeScript, no Phaser</text>
<text class="st" x="340" y="114">step(0.05) twenty times a second</text>
<rect class="box" x="486" y="30" width="170" height="52" rx="6"/>
<text class="t" x="571" y="48">Phaser scene</text>
<text class="st" x="571" y="65">draws between two steps</text>
<rect class="box" x="486" y="104" width="170" height="52" rx="6"/>
<text class="t" x="571" y="122">HUD</text>
<text class="st" x="571" y="139">plain DOM, reads the model</text>
<path class="edge-strong" d="M194 56 H222 V84 H250" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M194 130 H222 V104 H250" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M430 84 H458 V56 H484" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M430 104 H458 V130 H484" marker-end="url(#coc-arrow)"/>
<rect class="box" x="24" y="190" width="632" height="52" rx="6"/>
<text class="t" x="340" y="208">Saves</text>
<text class="st" x="340" y="225">IndexedDB with a localStorage backup · each raid kept as its setup, every step size and every action</text>
<path class="edge" d="M340 134 V188" marker-end="url(#coc-arrow)"/>
</svg>
<figcaption>How the game is split. The simulation never imports Phaser, so the same code runs a battle on screen, in a replay, in a test or in Node.</figcaption>
</figure>

The rule that shapes the codebase is a single sentence in its architecture notes: "A model import should not load Phaser, a scene class or multi-megabyte render data." `GameModel` holds the village, the economy and the battle, and nothing in its import graph touches the screen. The Phaser scene calls `step(0.05)` twenty times a second and draws each unit partway between its last two positions, so animation stays smooth at any frame rate without the simulation knowing frames exist. Fifty-three files import Phaser, and none of them is reachable from the model.

That separation is what made this post possible. Every figure below was produced by importing the model into a Node script, placing troops through its public API and stepping it to the end. It is also how the game's own tests run battles.

## Where you attack from

A raid starts with deployment. Troops can land anywhere outside a red zone that hugs the village, 1.5 tiles out from every building except walls and traps. Once down, each troop picks a target and walks there. Barbarians and Archers want the nearest building of any kind. Giants want the nearest defense. Goblins go for resources, and Wall Breakers look for the nearest wall standing between them and the buildings closest to them. Defenses fire at the nearest troop they can hit and stay on it until it dies or walks out of range. The score is two lines:

```ts
b.destruction = total ? Math.floor((dead / total) * 100) : 100;  // walls and traps don't count
b.stars = Number(b.destruction >= 50) + Number(townHallDead) + Number(b.destruction === 100);
```

So where you land decides what your troops meet first. Figure 2 is one army, 6 Giants, 4 Wall Breakers, 16 Barbarians and 16 Archers, sent into Ember Keep from twelve points around it. Each raid deploys in the same order: Giants first, Wall Breakers behind them, then the rest.

<figure class="fig wide" id="coc-raid" style="--reserve: 560px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Twelve raids on Ember Keep, one from each landing point, simulated by the game's engine. Click a point to watch its raid; the chart shows destruction over time for all twelve. Thin lines are defenses firing. Two raids stalled with troops still alive and were ended by hand after 20 seconds without damage, as a player would end them.</figcaption>
</figure>

<a class="act" href="#coc-raid" data-point="3">From the northeast</a> the army runs into the village's defenses one at a time, and all 42 troops are dead at 37%, with no stars. <a class="act" href="#coc-raid" data-point="5">From lower down the same side</a> the same army reaches the core with four of its six Giants still standing and takes three stars in 42 seconds. Nothing differs between those raids but the landing point. A Giant that lands near a Cannon fights the Cannon; one that lands near an Archer Tower fights that, and the Barbarians follow whatever is nearest to them.

## Routes through walls

Every troop finds its way with A* on the village's 48 × 48 tile grid, moving in four directions. Buildings are solid. Walls are not: a troop can path through one, at a price, and attack it when it gets there.

```ts
const next = base + 1 + (wall[n] ? 6 : 0);
```

A step across open ground costs 1 and a step into a wall costs 7. So a troop walks up to six extra tiles to go around a wall before it decides to break through. Routes are recomputed every 1.5 seconds and whenever any building falls, because a gap in the wall changes every route near it.

<figure class="fig wide" id="coc-paths" style="--reserve: 480px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Routes from 64 points around Ember Keep, computed by the game's own <code>findPath</code>. Each troop type heads for its preferred target; red squares are the walls a route goes through rather than around.</figcaption>
</figure>

<a class="act" href="#coc-paths" data-troop="barbarian">Barbarians</a> never need to break a wall here: the nearest building is always outside one. <a class="act" href="#coc-paths" data-troop="giant">Giants</a> want defenses, and the defenses sit inside the walls, so 20 of the 64 starting points send them straight through. That is why a raid needs Wall Breakers, or Giants to soak up damage while the wall comes down.

The search has been rewritten more than once. On two dense villages, each simulation once took "tens of seconds of CPU" because the open set was a list scanned linearly. A stable binary heap that breaks ties first-in, first-out brought both under a second. A golden digest of routes proved the new search found exactly the same paths, tie for tie, which matters for the reason in the last section.

## One army, twelve villages

The campaign's twelve authored villages climb from Goblin Outpost to King's End. Figure 4 sends three armies into each of them from the same side.

<figure class="fig" id="coc-sweep" style="--reserve: 420px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Destruction on each authored village for three armies, all deployed from the west. Hover over a village to see its layout and the results.</figcaption>
</figure>

The small army takes the first four villages and fades from there. The medium army holds three stars until the eighth village, then two, and nothing takes King's End. <a class="act" href="#coc-sweep" data-village="8">The air army</a> is the interesting one. Balloons and Dragons fly over every wall, so they three-star the first eight villages as easily as the ground army does. On the Expert villages, which have two Air Defenses instead of one, they fall off much faster.

## Every step, recorded

A replay is the strongest test a simulation can face. Crown & Clan doesn't record a battle as video or as a stream of states. It records the setup (the enemy layout, your army, your research levels) and then every action you took, stamped with the step it happened on. Watching a replay means running the battle again. That only works if running it again gives exactly the same battle.

Three things make that hold.

**There is no random number generator in combat.** Where the rules need chance, they hash the battle's fixed seed with a counter, so the same question always gets the same answer.

**The arithmetic is pinned.** The distance function is written out by hand, because "browser `Math.hypot` implementations otherwise disagree by a few bits in movement and projectile arrival times". A few bits is enough for a unit to arrive one step later in Safari than in Chrome and for two replays of the same battle to end differently. The game's tests now compare battle states exactly, at every 0.05-second step, in Node, Chromium and WebKit.

**The step size is part of the recording.** The model accepts any step, and a different step is a different battle. Figure 5 runs one raid twice, stepped at 0.05 seconds and at 0.1.

<figure class="fig wide" id="coc-det" style="--reserve: 520px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>The same raid on Goblin Outpost with the same actions, stepped every 0.05 s and every 0.1 s. Lines trace where each troop has walked. Run again at the same step, or replayed from its recording, the first battle is identical to the bit.</figcaption>
</figure>

Both raids take three stars, but they are not the same battle. <a class="act" href="#coc-det" data-time="8">Halfway through</a> the troops are in different places, and the coarse one finishes 0.45 seconds sooner, in a different final state. So the game records every step size it actually took, as well as every action. The whole recording of this 16-second raid is 45 actions and 317 step sizes, under 10 KB.

To scrub backwards, the replay viewer keeps a full copy of the battle every ten seconds and simulates forward from the nearest one. And the rules keep changing: the recording format is at version 54, and the game still plays recordings back to version 34. When a rule changes, the old behaviour stays behind a flag that older recordings switch on. Archived recordings with frozen state hashes check that an old replay still passes through exactly the states it did; version 41 alone pins 2,534 of them.

One replay bug came from a cache. Route grids were cached under a 32-bit hash of the building ids. The ids are `1000 + index`, so two campaign villages of the same size hashed alike, and a battle could be routed through the previous village's buildings until its first building fell. A live battle and its replay could then diverge. The key is now an exact snapshot of the building list.

## Making it fast enough

The largest native village has 820 buildings, 533 of them walls. With twelve of every troop on the field, 589 units of 35 kinds, the game ran at 13 frames a second. It now runs at 41 to 43, with draw calls down from about 1,500 to 360 and the simulation step down by about a third. Two findings along the way were measurement bugs rather than performance bugs. The benchmark's loop re-read a shrinking count, so the rows labelled 589 units had measured 295. And Phaser's frame smoothing capped each frame's time, so a phone running at 3 frames a second advanced the battle 0.05 seconds per real second: a raid that should take three minutes took an hour. A CI smoke test had been failing on exactly that from its 48th run onward.

## What I would tell myself in September

- **Keep the simulation importable without a screen.** Every test, every replay, every figure in this post and every balance question comes from running the model somewhere other than the game.
- **Record the step, not just the input.** Determinism means the same inputs on the same steps give the same result. The step size is an input.
- **Freeze old answers.** Once replays exist, a rule change that alters an old battle breaks a promise. Hashes of archived battles turn that promise into a test.
- **Suspect the benchmark first.** Two of the biggest performance "results" were the measurement lying.

If you have a few minutes, [play a raid](https://coc.teozeng.dev), then open its replay and scrub backwards.
