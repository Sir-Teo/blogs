---
layout: post
title: "Replaying a village raid"
series: games
description: >-
  How Crown & Clan keeps its TypeScript battle simulation decoupled from Phaser,
  deterministic across browsers, and replayable from a 10 KB log of taps and
  step sizes.
image: /assets/social/replaying-a-village-raid.png
date: 2026-10-09 13:00:00 -0400
excerpt: >-
  A replay of a 16-second raid fits in under 10 KB, because it isn't a video.
  It's your taps, played back through a battle simulation that has to come out
  identical in every browser, down to the last bit.
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

A replay of a raid in **Crown & Clan** is under 10 KB. It isn't a video, and it isn't a list of where every unit stood. It's the village, your taps, and the length of every simulation step, and the game plays the whole battle again from scratch. That only works if the simulation comes out identical every time, in every browser, down to the last bit of every number.

Crown & Clan is a village-building and raiding game in the mould of Clash of Clans, written in TypeScript and Phaser with no server behind it. Every battle in the figures below was simulated by the game's own engine in Node, on the twelve campaign villages the project designed. The figures draw plain shapes instead of game art.

## A simulation with no screen

<figure class="fig">
<svg class="arch" viewBox="0 0 680 262" role="img" aria-label="Taps and recorded actions go into GameModel, a pure TypeScript simulation stepped at 20 Hz; a Phaser scene and a DOM HUD read it; saves and recordings go to the browser's storage.">
<defs>
<marker id="coc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="16" y="30" width="168" height="52" rx="6"/>
<text class="t" x="100" y="48">Your taps</text>
<text class="st" x="100" y="65">deploy, spell, end</text>
<rect class="box" x="16" y="104" width="168" height="52" rx="6"/>
<text class="t" x="100" y="122">A recording</text>
<text class="st" x="100" y="139">the same actions, replayed</text>
<rect class="box em" x="234" y="56" width="212" height="76" rx="6"/>
<text class="t" x="340" y="80">GameModel</text>
<text class="st" x="340" y="98">pure TypeScript, no Phaser</text>
<text class="st" x="340" y="114">step(0.05), twenty times a second</text>
<rect class="box" x="496" y="30" width="168" height="52" rx="6"/>
<text class="t" x="580" y="48">Phaser scene</text>
<text class="st" x="580" y="65">draws between two steps</text>
<rect class="box" x="496" y="104" width="168" height="52" rx="6"/>
<text class="t" x="580" y="122">HUD</text>
<text class="st" x="580" y="139">plain DOM, reads the model</text>
<path class="edge-strong" d="M184 56 H209 V84 H232" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M184 130 H209 V104 H232" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M448 84 H471 V56 H494" marker-end="url(#coc-arrow)"/>
<path class="edge-strong" d="M448 104 H471 V130 H494" marker-end="url(#coc-arrow)"/>
<rect class="box" x="16" y="190" width="648" height="52" rx="6"/>
<text class="t" x="340" y="208">Saves</text>
<text class="st" x="340" y="225">IndexedDB with a localStorage backup · each raid kept as its setup, every step size and every action</text>
<path class="edge" d="M340 134 V188" marker-end="url(#coc-arrow)"/>
</svg>
<figcaption>The simulation never imports Phaser, so the same code runs a battle on screen, in a replay, in a test or in Node.</figcaption>
</figure>

One rule governs the whole 66,000-line codebase: `GameModel` may never import Phaser, a scene class, or any rendering data. Fifty-three files in the repository touch Phaser, and none of them can be reached from the simulation.

During a battle, the Phaser scene steps `GameModel` forward in short time steps, normally 0.05 seconds (twenty a second), and draws units part-way between two steps so movement looks smooth at any refresh rate. The model never knows frames exist. Because it's plain TypeScript, the same class runs live raids in the browser, checks replays in CI, and produced every figure on this page from a Node script.

## Where you attack from

<figure class="fig wide" id="coc-raid" style="--reserve: 560px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>One army, twelve landing points around Ember Keep, each raid run by the game's engine. Troops can't land in the shaded zone.</figcaption>
</figure>

Once deployed outside the shaded zone, every unit follows a greedy rule for choosing a target. Barbarians and Archers march to the nearest building of any kind. Giants ignore resource huts and head for the nearest defense. That makes your landing point decisive: it decides which defenses your Giants meet first and how long the damage dealers behind them survive.

Deploy the same 42-troop army (6 Giants, 4 Wall Breakers, 16 Barbarians, 16 Archers) from twelve points around Ember Keep and the outcomes split completely. <a class="act" href="#coc-raid" data-point="3">From the northeast</a>, the army strings out into the defenses one at a time and dies at 37% destruction with no stars. <a class="act" href="#coc-raid" data-point="5">From lower down the same side</a>, four of the six Giants survive into the core and the raid takes all three stars in 42 seconds. The stars are scored like this:

```ts
b.stars = Number(b.destruction >= 50)
  + Number(townHallDead)
  + Number(b.destruction === 100);
```

## Routes through walls

<figure class="fig wide" id="coc-paths" style="--reserve: 480px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Routes from 64 points around the village, from the game's own <code>findPath</code>. Red: walls a route breaks through.</figcaption>
</figure>

Ground units find their way across the 48×48 tile grid with A* search, moving in four directions. Buildings are solid. Walls are passable at a price: a step onto grass costs 1, and a step through a wall tile costs 7. So a troop will walk up to six extra tiles around a wall before deciding to stop and batter through it, and it plans again whenever a building or wall segment falls.

<a class="act" href="#coc-paths" data-troop="giant">Giants</a> only target defenses, and Ember Keep's defenses sit inside stone compartments, so 20 of the 64 starting points send Giants straight through a wall. <a class="act" href="#coc-paths" data-troop="barbarian">Barbarians</a> settle for the closest building of any kind, which from the edge of the map is always an outside building, so their first routes never break a wall at all.

## One army, twelve villages

<figure class="fig" id="coc-sweep" style="--reserve: 420px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Destruction on each of the campaign's twelve villages, for three armies deployed from the west.</figcaption>
</figure>

Because `GameModel` runs without a screen, balancing the twelve-stage campaign is a loop in Node: send test armies at every village and read the scores. Deployed from the west, the small starter army fades after the fourth village, while the medium ground force holds three stars through village eight. <a class="act" href="#coc-sweep" data-village="8">The air army</a> of Balloons and Dragons flies over every wall and clears the first eight villages as easily as the ground army does, then falls off sharply on the Expert stages, as soon as villages gain a second Air Defense.

## Every step, recorded

<figure class="fig wide" id="coc-det" style="--reserve: 520px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>The same raid with the same taps, stepped every 0.05 s and every 0.1 s. Lines trace each troop.</figcaption>
</figure>

Back to the replay. It saves the starting setup, your timestamped taps, and the size of every simulation step: 45 actions and 317 steps for the 16-second raid above, under 10 KB in all.

Why record step sizes, if the scene normally steps 0.05 seconds? Because they aren't always the same (a practice tutorial, for one, slows a battle down by shrinking them), and a different step size gives a different battle. The two boards above run the same taps at 0.05 s and 0.1 s steps. <a class="act" href="#coc-det" data-time="8">Halfway through the raid</a>, the two battles have already gone different ways.

Steps are the easy part. The harder part is making each step produce the same numbers on every machine:

- **No ambient randomness.** Combat never calls `Math.random`. When a rule needs chance, it hashes a fixed battle seed with a counter, so the "random" result is the same on every replay.
- **No browser-dependent math.** Distances are computed with explicit arithmetic instead of `Math.hypot`, which browsers are allowed to round differently in the last few bits. That's enough for a projectile in Safari to land one tick later than in Chrome, and from there the whole raid forks.

Get those right and a 10 KB log is a complete battle. It's also why everything else on this page was cheap to make: the landing points, the 64 routes, and the campaign sweep are all the same simulation, run in a loop with no screen.

<p class="credit">Crown & Clan is an independent fan project. As its README notes, "Clash of Clans assets and trademarks belong to Supercell," so the figures here use plain shapes instead of game art.</p>
