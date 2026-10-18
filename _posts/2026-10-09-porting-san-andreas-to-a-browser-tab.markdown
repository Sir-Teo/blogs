---
layout: post
title: "Porting San Andreas to a browser tab"
description: >-
  How web-gta streams San Andreas into a browser tab, executes the original SCM
  mission bytecode, ports CCarCtrl traffic arithmetic, and fits a 900 MB world
  onto a phone.
date: 2026-10-09 14:00:00 -0400
excerpt: >-
  Recreating San Andreas inside a browser tab—how world streaming, the original
  mission bytecode VM, traffic braking arithmetic, and mobile memory budgets
  work, explored with live figures from the port's own code.
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

**web-gta** recreates *Grand Theft Auto: San Andreas* inside a browser tab, streaming the original 900 MB world as you drive and executing the original mission scripts. Because the game's map, models, scripts, and audio belong to Rockstar ("Native assets retain their original ownership," the project's notes state), none of that proprietary content appears on this page. Instead, every interactive figure below runs the port's own TypeScript subsystems live on synthetic inputs built for this post.

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

Keeping an open-world game smooth in a browser means keeping the 900 MB map off the thread that draws frames. On the main thread, the simulation steps at a fixed 60 Hz—updating CJ, ambient traffic, pedestrians, police, and the mission script interpreter—alongside Rapier physics in WebAssembly and a `three.js` renderer capped at 30 fps. Everything that touches storage or network lives in background workers: a chunk fetcher downloads, verifies, caches, and inflates raw world archives across 1,943 hash-addressed chunks, while a world streamer unpacks building placements, geometry, and collision meshes for the active region.

Gameplay systems are ported from `gta-reversed`, the community's C++ reconstruction of the PC game; wherever `gta-reversed` has only a stub, the port cross-references the disassembled iOS executable to recover the missing logic.

## Streaming a state

<figure class="fig" id="gta-stream">
<figcaption>The port's region follower on a made-up road, one minute of driving with each window taking a fixed time to load. The strip at the bottom is the same follower in the real game, on a scripted 90-second drive, before and after the streaming worker stopped re-decoding models it already had.</figcaption>
</figure>

The world arrives in 180-unit high-detail windows surrounded by low-detail LODs out to 1,000 units. A small state machine, the region follower, tracks a look-ahead point in front of the car: once that point drifts 30% of a radius from the current window's center, it asks the worker for the next window; if the car travels 85% of the way to the edge before the new window arrives, the game pauses on a streaming hold rather than letting CJ drive off the end of the collision mesh.

On the synthetic straight road above, <a class="act" href="#gta-stream" data-speed="70" data-latency="2" data-lead="fixed">at 70 m/s, 2-second windows</a> land just in time and never stop the car. <a class="act" href="#gta-stream" data-speed="70" data-latency="2.1" data-lead="fixed">At 2.1 seconds</a>, that extra tenth of a second pushes the car past the 85% threshold and triggers repeated holds.

That exact cliff showed up in the real game. When players reported freezes on fast highways, a scripted route probe drove a 90-second diagonal across the map at 70 m/s and logged 53 streaming holds totaling 28.6 seconds—and along the way uncovered a Rapier physics body leak that no unit test had caught. The streaming worker had been decoding every model in each new window before discarding the ones already resident in memory. Skipping already-loaded models before decoding and caching collision data cut window load times from 1.3–1.9 seconds down to 60–350 ms, reducing the same 90-second drive to a single 1.4-second hold at the start.

## Running the original scripts

<figure class="fig wide" id="gta-vm">
<figcaption>The port's script decoder and interpreter on a six-instruction script assembled for this page. Below, the port's census of the 1,570 commands the original scripts use.</figcaption>
</figure>

San Andreas's story, side jobs, cutscene timing, and ambient triggers are all compiled into Rockstar's SCM bytecode (`main.scm` plus roughly two hundred streamed mission scripts), and web-gta executes that original bytecode directly. Each cooperative script thread steps through instructions—a two-byte opcode followed by type-tagged arguments—until it reaches a `WAIT`, then sleeps until the game clock catches up. (<a class="act" href="#gta-vm" data-wait="1000" data-play="1">Set the wait to a full second</a> and the thread spends almost all its time asleep, which is what most of the game's background threads are doing at any moment.)

Writing the bytecode interpreter is the small part; the real work is the opcode catalogue behind it. The original scripts call 1,570 distinct commands across 416,669 places in the bytecode, and each one needs an engine subsystem behind it to spawn a car, assign a pedestrian task, or start a phone call. When a thread hits one of the 127 commands that aren't ported yet, the interpreter logs the skip, reports "nothing found" for its outputs, and lets the mission carry on rather than crashing the script.

## Traffic from the original arithmetic

<figure class="fig" id="gta-traffic">
<figcaption>Two made-up cars. The blue one brakes with the port of <code>CCarCtrl::SlowCarDownForOtherCar</code> for whatever gap the grey one leaves.</figcaption>
</figure>

Ambient traffic runs a direct port of `CCarCtrl::SlowCarDownForOtherCar`. When another vehicle enters the scan zone ahead, the follower caps its target speed at roughly 62% of cruise and slows down in proportion to the closing gap.

Right behind a bumper, however, three consecutive branches in the original formula produce a quirk you can watch live above. <a class="act" href="#gta-traffic" data-place="8.5">Stopped 8.5 units behind</a> the lead car, the follower stays put in the outer stop zone. Place it <a class="act" href="#gta-traffic" data-place="7.5">one unit closer</a> and it lands in a middle branch that commands a crawl speed of `1`, creeping forward until it hits the inner stop zone at 5.9 units—closer than the spot where it was already stopped, it starts moving again. Both zones come straight out of the branching arithmetic ported from `reVC`.

## Fitting on a phone

<figure class="fig" id="gta-res">
<figcaption>The port's adaptive-resolution controller on three made-up phones. Grey is frame time, blue the resolution scale.</figcaption>
</figure>

Running a desktop open-world game inside a mobile browser hits three bottlenecks at once: fill-rate limits, thermal throttling, and tight memory ceilings. To protect frame rate, the adaptive-resolution controller watches the median frame time over a three-second window and drops a step down the resolution ladder (`100% → 85% → 72% → 60%`) whenever rendering stays slower than 26 fps. On <a class="act" href="#gta-res" data-kind="gpu" data-base="45">a GPU-bound phone</a>, stepping down to 85% immediately restores smooth frames; on <a class="act" href="#gta-res" data-kind="cpu" data-base="45">a CPU-bound phone</a>, fewer pixels make no difference, so the controller undoes the step after a single window and backs off—waiting twice as long before each retry—rather than blurring the screen for nothing.

<figure class="fig" id="gta-dxt">
<figcaption>One 8-byte DXT1 block through the port's decoder, to 32-bit colour and to the 16 bits a phone gets. The two endpoint colours and the sixteen indices are the whole block.</figcaption>
</figure>

Because few mobile GPUs can sample the PC release's DXT-compressed textures directly, the port decodes them on the CPU as chunks stream in. Decoding DXT1 blocks into 16-bit colour (`RGB565`, or `RGB5A1` when a block uses DXT1's transparency mode—<a class="act" href="#gta-dxt" data-swap="1">swap the two endpoints</a> to see `c0 <= c1` turn index `3` clear) instead of 32-bit RGBA cut texture memory around Grove Street in half, from 93 MB to 46 MB.

<figure class="fig" id="gta-steer">
<figcaption>The port's touch-stick steering against a stick that steers one for one. The stick springs back when let go.</figcaption>
</figure>

Finally, because a thumb on glass has no physical resistance, the touch thumbstick uses the iOS port's non-linear steering curve: the first third of the stick's travel turns the wheels only a fifth of the way so you can make fine lane corrections at speed, while the outer range opens up to full lock.
