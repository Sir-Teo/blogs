---
layout: post
title: "Porting San Andreas to a browser tab"
series: games
description: >-
  How web-gta streams San Andreas into a browser tab, executes the original SCM
  mission bytecode, ports CCarCtrl traffic arithmetic, and fits a 900 MB world
  onto a phone.
image: /assets/social/porting-san-andreas-to-a-browser-tab.png
date: 2026-10-09 14:00:00 -0400
excerpt: >-
  San Andreas in a browser tab: a 900 MB world streamed in as you drive, the
  original mission scripts running on their own bytecode, and a test drive
  that stopped 53 times in 90 seconds until the streaming worker learned to
  skip work it had already done.
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

**web-gta** recreates *Grand Theft Auto: San Andreas* in a browser tab. It streams the original 900 MB world as you drive and runs the game's original mission scripts. The interesting problems are less about drawing San Andreas than about feeding it: getting a world that size to the right place on time, on hardware as small as a phone, without a car at highway speed outrunning what's loaded.

The game's map, models, scripts, and audio belong to Rockstar, so none of them appear on this page. Instead, every figure runs the port's own TypeScript on small inputs made up for this post.

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

Keeping an open world smooth in a browser starts with keeping its 900 MB off the thread that draws frames. The main thread runs the simulation at a fixed 60 steps a second (CJ, traffic, pedestrians, police, and the mission script interpreter), along with Rapier physics compiled to WebAssembly and a `three.js` renderer capped at 30 frames a second, the same limit the original PC game's frame limiter used. Some of the game's effects count frames rather than seconds, so matching the original rate keeps them looking right.

Everything that touches storage or the network lives in background workers. A chunk fetcher downloads, verifies, caches, and unpacks the world's 1,943 chunks, each named by the hash of its contents. A world streamer turns them into building placements, models, and collision meshes for the area around you.

Most gameplay is ported from `gta-reversed`, the community's C++ reconstruction of the PC game. Where `gta-reversed` only has a stub, the port cross-references the disassembled iOS version to recover the missing logic.

## Streaming the map

<figure class="fig" id="gta-stream">
<figcaption>The port's region follower on a made-up road, one minute of driving with each window taking a fixed time to load. The strip at the bottom is the same follower in the real game, on a scripted 90-second drive, before and after the streaming worker stopped re-decoding models it already had.</figcaption>
</figure>

The world arrives in windows: 180 units of full detail, surrounded by low-detail models out to 1,000 units. A small state machine, the region follower, watches a point just ahead of the car. Once that point drifts 30% of a radius from the current window's center, it asks the worker for the next window. If the car gets 85% of the way to the edge before the new window arrives, the game pauses on a *streaming hold* rather than let CJ drive off the end of the collision mesh.

On the made-up straight road above, <a class="act" href="#gta-stream" data-speed="70" data-latency="2" data-lead="fixed">at 70 m/s with 2-second windows</a>, each window lands just in time and the car never stops. <a class="act" href="#gta-stream" data-speed="70" data-latency="2.1" data-lead="fixed">At 2.1 seconds</a>, that extra tenth of a second pushes the car past the 85% line, and the holds start repeating.

That cliff showed up in the real game. Players reported freezes on fast highways, so a scripted probe drove a 90-second diagonal across the map at 70 m/s. It logged 53 streaming holds, 28.6 seconds of standing still. The cause was in the streaming worker: it decoded every model in each new window and only then threw away the ones already in memory. Skipping already-loaded models *before* decoding, and caching collision data, cut window loads from 1.3–1.9 seconds to 60–350 milliseconds. The same drive now has one 1.4-second hold, at the start. The probe also turned up a leak of Rapier physics bodies that no unit test had caught.

## Running the original scripts

<figure class="fig wide" id="gta-vm">
<figcaption>The port's script decoder and interpreter on a six-instruction script assembled for this page. Below, the port's census of the 1,570 commands the original scripts use.</figcaption>
</figure>

San Andreas's story missions, side jobs, cutscene timing, and ambient events are all compiled into Rockstar's SCM bytecode: `main.scm` plus roughly two hundred mission scripts loaded on demand. web-gta runs that original bytecode. Each script thread steps through instructions (a two-byte opcode followed by type-tagged arguments) until it reaches a `WAIT`, then sleeps until the game clock catches up. <a class="act" href="#gta-vm" data-wait="1000" data-play="1">Set the wait to a full second</a> and the thread spends nearly all its time asleep, which is what most of the game's background threads are doing at any moment.

The interpreter is the small part. The real work is everything behind the opcodes. The original scripts use 1,570 distinct commands in 416,669 places, and each command needs an engine system behind it to spawn a car, give a pedestrian a task, or start a phone call. When a thread hits one of the 127 commands that aren't ported yet, the interpreter logs the skip, reports "nothing found" for its outputs, and lets the mission carry on instead of crashing the script.

## Traffic from the original arithmetic

<figure class="fig" id="gta-traffic">
<figcaption>Two made-up cars. The blue one brakes with the port of <code>CCarCtrl::SlowCarDownForOtherCar</code> for whatever gap the grey one leaves.</figcaption>
</figure>

Ambient traffic runs a direct port of `CCarCtrl::SlowCarDownForOtherCar`. When another car enters the zone ahead, the follower caps its target speed at about 62% of cruise and slows in proportion to the closing gap.

Right behind a bumper, three branches of the original formula produce a quirk you can watch above. A car <a class="act" href="#gta-traffic" data-place="8.5">stopped 8.5 units behind</a> the lead car stays put: it's in the outer stop zone. Put it <a class="act" href="#gta-traffic" data-place="7.5">one unit closer</a> and it falls into a middle branch that sets a crawl speed of 1, so it creeps forward until it reaches the inner stop zone at 5.9 units. Being closer is what makes it move. Both zones come straight from the branching arithmetic, ported here from `reVC`, the community's reconstruction of *Vice City*, San Andreas's predecessor.

## Fitting on a phone

<figure class="fig" id="gta-res">
<figcaption>The port's adaptive-resolution controller on three made-up phones. Grey is frame time, blue the resolution scale.</figcaption>
</figure>

A desktop open-world game in a mobile browser hits three limits at once: how many pixels the GPU can fill, heat, and memory. To protect the frame rate, an adaptive-resolution controller watches the median frame time over three seconds and steps down a resolution ladder (`100% → 85% → 72% → 60%`) whenever rendering stays below 26 frames a second.

On <a class="act" href="#gta-res" data-kind="gpu" data-base="45">a phone limited by its GPU</a>, stepping down to 85% brings back smooth frames immediately. On <a class="act" href="#gta-res" data-kind="cpu" data-base="45">a phone limited by its CPU</a>, fewer pixels make no difference, so the controller undoes the step after one window and backs off, waiting twice as long before each retry rather than blurring the screen for nothing.

<figure class="fig" id="gta-dxt">
<figcaption>One 8-byte DXT1 block through the port's decoder, to 32-bit colour and to the 16 bits a phone gets. The two endpoint colours and the sixteen indices are the whole block.</figcaption>
</figure>

The PC release stores textures in DXT, a compressed format few mobile GPUs can read directly, so the port decodes them on the CPU as chunks arrive. Decoding to 16-bit colour (`RGB565`, or `RGB5A1` when a block uses DXT1's transparency mode) instead of 32-bit cut texture memory around Grove Street in half, from 93 MB to 46 MB. <a class="act" href="#gta-dxt" data-swap="1">Swap the block's two endpoint colours</a> to see that mode switch on: when the first endpoint is no larger than the second (`c0 <= c1`), index `3` means transparent.

<figure class="fig" id="gta-steer">
<figcaption>The port's touch-stick steering against a stick that steers one for one. The stick springs back when let go.</figcaption>
</figure>

Finally, a thumb on glass has no resistance to push against, so the touch stick uses the iOS version's curved steering. The first third of the stick's travel turns the wheels only a fifth of the way, for small lane corrections at speed, and the outer range opens up to full lock.

The census in the script figure is the honest measure of where the port stands. Every one of the 127 unported commands is a gap a mission can fall into, and each has to be filled the same way the traffic and streaming code were: from the original arithmetic, checked against the original game.
