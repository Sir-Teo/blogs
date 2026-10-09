---
layout: post
title: "Replaying a village raid"
description: >-
  How Crown & Clan, a village-raiding strategy game in the browser, keeps its
  battle simulation off the screen, deterministic to the bit, and replayable.
date: 2026-10-09 13:00:00 -0400
excerpt: >-
  A village-raiding strategy game in the browser, with a battle simulation
  that runs without a screen and replays to the bit.
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

Crown & Clan is a village-raiding game in the mould of Clash of Clans, in TypeScript and Phaser, with no server: 601 commits since September 10. It is a fan project, and its README says so: "Clash of Clans assets and trademarks belong to Supercell." So the figures draw plain shapes. Every battle in them was run by the game's own engine, in Node, on the twelve villages the project designed itself.

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

## Where you attack from

<figure class="fig wide" id="coc-raid" style="--reserve: 560px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>One army, twelve landing points around Ember Keep, each raid run by the game's engine. Troops can't land in the shaded zone.</figcaption>
</figure>

Troops walk to the nearest building they like (Giants: defenses), so the landing point decides what they meet first. <a class="act" href="#coc-raid" data-point="3">From the northeast</a> the army is wiped out at 37%. <a class="act" href="#coc-raid" data-point="5">From lower down the same side</a>, it takes three stars in 42 seconds.

```ts
b.stars = Number(b.destruction >= 50)
  + Number(townHallDead)
  + Number(b.destruction === 100);
```

## Routes through walls

<figure class="fig wide" id="coc-paths" style="--reserve: 480px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Routes from 64 points around the village, from the game's own <code>findPath</code>. Red: walls a route breaks through.</figcaption>
</figure>

Pathfinding is A* on the tile grid, where a step costs 1 and a step into a wall costs 7. <a class="act" href="#coc-paths" data-troop="giant">Giants</a> want the defenses inside the walls, so 20 of the 64 routes go through one. <a class="act" href="#coc-paths" data-troop="barbarian">Barbarians</a> never need to.

## One army, twelve villages

<figure class="fig" id="coc-sweep" style="--reserve: 420px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>Destruction on each of the campaign's twelve villages, for three armies deployed from the west.</figcaption>
</figure>

<a class="act" href="#coc-sweep" data-village="8">Air</a> clears the first eight villages as easily as the ground army, then falls off once the villages have two Air Defenses.

## Every step, recorded

<figure class="fig wide" id="coc-det" style="--reserve: 520px" data-src="{{ '/assets/data/web-coc-demo.json' | relative_url }}">
<figcaption>The same raid with the same taps, stepped every 0.05 s and every 0.1 s. Lines trace each troop.</figcaption>
</figure>

A replay isn't a video: it's the setup and every tap, re-simulated. That only works if re-simulating gives the same battle. There is no random number generator in combat. Distances are computed by hand, because browsers' `Math.hypot` "disagree by a few bits". And since a different step size is a different battle, the recording keeps every step size too. This 16-second raid is 45 taps and 317 steps: under 10 KB.

[Play a raid](https://coc.teozeng.dev), then open its replay and scrub backwards.
