---
layout: post
title: "Replaying a village raid"
description: >-
  How Crown & Clan keeps its TypeScript battle simulation decoupled from Phaser,
  deterministic across browsers, and replayable from a 10 KB log of taps and
  step sizes.
date: 2026-10-09 13:00:00 -0400
excerpt: >-
  A browser strategy game whose battle simulation never touches the screen—how
  target selection, A* wall weights, headless campaign sweeps, and bit-exact
  replays work under the hood.
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

**Crown & Clan** is a village-building and raiding game in the mould of Clash of Clans, written in TypeScript and Phaser with no server behind it. Because it is an independent fan project ("Clash of Clans assets and trademarks belong to Supercell," its README notes), the figures here draw plain geometric shapes instead of sprites. Every battle in them was simulated by the game's own engine in Node across the twelve campaign villages the project designed itself.

## A simulation with no screen

<figure class="fig">
<svg class="arch" viewBox="0 0 680 262" role="img" aria-label="Taps and recorded actions go into GameModel, a pure TypeScript simulation stepped at 20 Hz; a Phaser scene and a DOM HUD read it; saves and recordings go to the browser's storage.">
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
<text class="st" x="340" y="114">step(0.05), twenty times a second</text>
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
<figcaption>The simulation never imports Phaser, so the same code runs a battle on screen, in a replay, in a test or in Node.</figcaption>
</figure>

One architectural rule governs the entire 66,000-line codebase: `GameModel` may never import Phaser, a scene class, or a single byte of rendering data. Fifty-three files in the repository touch Phaser, and none of them is reachable from the simulation. During a live battle, the Phaser scene steps `GameModel` twenty times a second (`step(0.05)`) and interpolates unit positions between ticks so movement looks smooth at any display refresh rate without the model knowing frames exist. Because the simulation is pure TypeScript, the exact same class runs live raids in the browser, verifies deterministic replays in CI, and generated every figure on this page from a Node script.

## Where you attack from

<figure class="fig wide" id="coc-raid" style="--reserve: 560px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>One army, twelve landing points around Ember Keep, each raid run by the game's engine. Troops can't land in the shaded zone.</figcaption>
</figure>

Once deployed outside the shaded exclusion zone, every unit follows a greedy target rule: Barbarians and Archers march toward the nearest building of any kind, while Giants ignore resource huts and head straight for the nearest defense. That makes your landing point decisive, because it determines which defenses your Giants engage first and how long your damage dealers survive behind them.

Deploy the exact same 42-troop army (6 Giants, 4 Wall Breakers, 16 Barbarians, 16 Archers) from twelve points around Ember Keep and the outcomes split completely. <a class="act" href="#coc-raid" data-point="3">From the northeast</a>, the army strings out into the village's defenses one at a time and dies at 37% destruction with zero stars. <a class="act" href="#coc-raid" data-point="5">From lower down the same side</a>, four of the six Giants survive into the core and the raid clears the village for all three stars in 42 seconds:

```ts
b.stars = Number(b.destruction >= 50)
  + Number(townHallDead)
  + Number(b.destruction === 100);
```

## Routes through walls

<figure class="fig wide" id="coc-paths" style="--reserve: 480px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Routes from 64 points around the village, from the game's own <code>findPath</code>. Red: walls a route breaks through.</figcaption>
</figure>

Every ground unit finds its way across the 48×48 tile grid with four-directional A*. Buildings are solid obstacles, while walls are passable at a price: stepping onto open grass costs `1`, and stepping through a wall tile costs `7`. A troop will detour up to six extra tiles around a wall before deciding to stop and batter through it, recomputing its path whenever a building or wall segment falls.

Because <a class="act" href="#coc-paths" data-troop="giant">Giants</a> only target defenses—and Ember Keep's defenses sit inside stone compartments—20 of the 64 perimeter starting points send them straight through a wall. <a class="act" href="#coc-paths" data-troop="barbarian">Barbarians</a> settle for the closest building of any kind, which from the perimeter is always an outside building, so their initial paths never break a wall at all.

## One army, twelve villages

<figure class="fig" id="coc-sweep" style="--reserve: 420px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Destruction on each of the campaign's twelve villages, for three armies deployed from the west.</figcaption>
</figure>

Because `GameModel` runs without a screen, balancing the twelve-stage single-player campaign means sweeping test armies across every village in Node. Deployed from the west, the small starter army fades after the fourth village, while the medium ground force holds three stars through village eight. <a class="act" href="#coc-sweep" data-village="8">Air</a> (Balloons and Dragons) flies over every wall to clear the first eight villages just as easily as the ground army, then falls off sharply on the Expert stages as soon as villages gain a second Air Defense.

## Every step, recorded

<figure class="fig wide" id="coc-det" style="--reserve: 520px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>The same raid with the same taps, stepped every 0.05 s and every 0.1 s. Lines trace each troop.</figcaption>
</figure>

Crown & Clan does not record a battle as video or as a stream of unit positions. A replay saves only the initial setup and your timestamped taps, then simulates the battle again from scratch—45 actions and 317 step sizes for the 16-second raid above, under 10 KB in all.

That only works if simulating the raid a second time produces the exact same battle to the bit. Combat uses no ambient random number generator, hashing a fixed battle seed with a counter whenever a rule needs chance. Distances are computed with explicit arithmetic because browser implementations of `Math.hypot` can disagree by a few least-significant bits—enough for a projectile in Safari to arrive one tick later than in Chrome and fork the rest of the raid. And because a different tick rate produces a different battle—as the two boards above show <a class="act" href="#coc-det" data-time="8">halfway through the raid</a>—the recording logs every step size alongside every tap.
