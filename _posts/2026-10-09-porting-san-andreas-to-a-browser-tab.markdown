---
layout: post
title: "Porting San Andreas to a browser tab"
description: >-
  web-gta streams San Andreas into a browser tab and runs the original
  mission scripts. Its streaming, script interpreter, traffic code and phone
  tricks, run live on made-up inputs.
date: 2026-10-09 14:00:00 -0400
excerpt: >-
  A browser recreation of San Andreas that streams the world as you drive and
  runs the original mission scripts. Its streaming, interpreter and traffic
  code, run live on made-up inputs.
links:
  - title: Live game
    url: https://sir-teo.github.io/web-gta/
  - title: Source
    url: https://github.com/Sir-Teo/web-gta
styles:
  - /assets/css/web-gta.css
scripts:
  - /assets/js/web-gta-core.js
  - /assets/js/web-gta-vm.js
  - /assets/js/web-gta.js
---

web-gta recreates San Andreas in a browser tab, running the original game's world, models, scripts and sounds. That content belongs to Rockstar ("Native assets retain their original ownership," the project's notes say), so none of it appears here. Every figure runs the port's own code on inputs made up for this page.

## What runs where

<figure class="fig">
<svg class="arch" viewBox="0 0 680 300" role="img" aria-label="Architecture: on the main thread, a fixed 60 Hz simulation, Rapier physics in WebAssembly, a three.js renderer and the region follower; in workers, the world streamer and the chunk fetcher; underneath, Cache Storage and a service worker.">
<defs>
<marker id="gta-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<text class="lbl" x="24" y="13">Main thread</text>
<text class="lbl" x="400" y="13">Workers</text>
<rect class="box" x="24" y="26" width="320" height="48" rx="6"/>
<text class="t" x="184" y="42">Simulation, a fixed 60 Hz</text>
<text class="st" x="184" y="59">CJ, traffic, peds, police, the script interpreter</text>
<rect class="box" x="24" y="88" width="152" height="48" rx="6"/>
<text class="t" x="100" y="104">Rapier</text>
<text class="st" x="100" y="121">physics, WebAssembly</text>
<rect class="box" x="192" y="88" width="152" height="48" rx="6"/>
<text class="t" x="268" y="104">three.js</text>
<text class="st" x="268" y="121">WebGL, at most 30 fps</text>
<rect class="box" x="24" y="150" width="320" height="48" rx="6"/>
<text class="t" x="184" y="166">Region follower</text>
<text class="st" x="184" y="183">asks for the window ahead, holds play if it is late</text>
<rect class="box" x="400" y="26" width="256" height="48" rx="6"/>
<text class="t" x="528" y="42">World streamer</text>
<text class="st" x="528" y="59">placements, models, collision per window</text>
<rect class="box" x="400" y="88" width="256" height="48" rx="6"/>
<text class="t" x="528" y="104">Chunk fetcher</text>
<text class="st" x="528" y="121">fetch, check, keep, inflate</text>
<path class="edge-strong" d="M346 174 H372 V50 H398" marker-end="url(#gta-arrow)"/>
<text class="el" x="372" y="190">request</text>
<path class="edge" d="M528 76 V86" marker-end="url(#gta-arrow)"/>
<rect class="box" x="24" y="222" width="632" height="62" rx="6"/>
<text class="t" x="340" y="240">The browser's storage</text>
<text class="st" x="340" y="258">Cache Storage: 1,943 world chunks, each named by its hash</text>
<text class="st" x="340" y="274">Service worker: the app, the start package and scripts</text>
<path class="edge" d="M528 138 V220" marker-end="url(#gta-arrow)"/>
</svg>
<figcaption>Everything a frame needs runs on the main thread; everything that touches the world's 900 MB runs in workers.</figcaption>
</figure>

Systems are ported from gta-reversed, the community's reconstruction of the PC game. Where that only has a stub, the port reads the iOS release's executable instead.

## Streaming a state

<figure class="fig" id="gta-stream">
<figcaption>The port's region follower on a made-up road, one minute of driving with each window taking a fixed time to load. The strip at the bottom is the same follower in the real game, on a scripted 90-second drive, before and after the streaming worker stopped re-decoding models it already had.</figcaption>
</figure>

The world arrives in 180-unit windows. The follower asks for the next one when the point ahead of the car drifts 30% off-centre, and holds the game if the car gets 85% of the way out before the window lands. <a class="act" href="#gta-stream" data-speed="70" data-latency="2" data-lead="fixed">At 70 m/s, 2-second windows</a> never stop the car. <a class="act" href="#gta-stream" data-speed="70" data-latency="2.1" data-lead="fixed">At 2.1 seconds</a> they do. The scripted drive is the project's probe for this; it found the holds, and a physics leak, that no unit test did.

## Running the original scripts

<figure class="fig wide" id="gta-vm">
<figcaption>The port's script decoder and interpreter on a six-instruction script assembled for this page. Below, the port's census of the 1,570 commands the original scripts use.</figcaption>
</figure>

The game's missions are bytecode, and the port runs the original. A thread runs until it reaches a `WAIT`, then sleeps until the game clock passes. The interpreter is the small part. Each of the 1,570 commands the scripts use needs an engine behind it, and a command that isn't ported yet is skipped, its outputs read as "nothing found", and the mission carries on.

## Traffic from the original arithmetic

<figure class="fig" id="gta-traffic">
<figcaption>Two made-up cars. The blue one brakes with the port of <code>CCarCtrl::SlowCarDownForOtherCar</code> for whatever gap the grey one leaves.</figcaption>
</figure>

<a class="act" href="#gta-traffic" data-place="8.5">Stopped 8.5 units behind</a>, the follower stays put. <a class="act" href="#gta-traffic" data-place="7.5">One unit closer</a>, it creeps up to the inner stop zone. The zones come out of the formula's branches, which follow reVC's.

## Fitting on a phone

<figure class="fig" id="gta-res">
<figcaption>The port's adaptive-resolution controller on three made-up phones. Grey is frame time, blue the resolution scale.</figcaption>
</figure>

Slower than 26 fps for three seconds, the controller drops a step. If that didn't help, the CPU is the bottleneck. It undoes the step and waits before trying again, twice as long each time.

<figure class="fig" id="gta-dxt">
<figcaption>One 8-byte DXT1 block through the port's decoder, to 32-bit colour and to the 16 bits a phone gets. The two endpoint colours and the sixteen indices are the whole block.</figcaption>
</figure>

Few phone GPUs can sample the PC's compressed textures, so the port decodes them on the CPU, and to 16 bits rather than 32.

<figure class="fig" id="gta-steer">
<figcaption>The port's touch-stick steering against a stick that steers one for one. The stick springs back when let go.</figcaption>
</figure>
