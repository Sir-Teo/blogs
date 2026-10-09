---
layout: post
title: "Porting San Andreas to a browser tab"
description: >-
  How web-gta streams a whole state into a browser, runs the original game's
  own mission scripts, ports its traffic and flight code, and keeps a phone
  from running out of memory or frames.
date: 2026-10-09 14:00:00 -0400
excerpt: >-
  A browser recreation of San Andreas that streams the world as you drive,
  runs the original mission scripts and ports the game's own traffic and flight
  code. How the pieces fit, and what it took to make them fast.
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

web-gta is a single-player recreation of Grand Theft Auto: San Andreas that runs in a browser tab, built on the original game's own content. It opens on Grove Street and streams the state around you as you travel. The cars are the original models with their original handling, seventeen aircraft fly, ambient traffic follows the original road network, and the original script runs the story from its first mission. It is also the fastest-moving project I have worked on: the first commit was on September 13, and less than four weeks later it has 2,784 commits and about 83,000 lines of TypeScript.

The world, models, scripts and sounds are the original game's, re-chunked from a public mirror and served from GitHub Pages. The project's notes are careful about what that does and doesn't mean: "Public hosting establishes accessibility, not an open-content license or certified retail identity," and "Native assets retain their original ownership." So nothing on this page uses the game's data. Each figure runs a piece of the port's own TypeScript, compiled for this page, on inputs made up for it: a straight road, a hand-assembled script, two boxes for cars, an imaginary phone, a single texture block.

## The shape of the port

<figure class="fig">
<svg class="arch" viewBox="0 0 680 300" role="img" aria-label="Architecture: on the main thread, a fixed 60 Hz simulation (player, traffic, pedestrians and the script interpreter), Rapier physics in WebAssembly, and a three.js renderer capped at 30 frames a second; in workers, the world streamer and the chunk fetcher; underneath, Cache Storage holding world chunks by hash and a service worker holding the app.">
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
<text class="st" x="340" y="258">Cache Storage: 1,943 world chunks, each named by its hash, kept past the HTTP cache</text>
<text class="st" x="340" y="274">Service worker: the app, the start package and scripts, revalidated by ETag</text>
<path class="edge" d="M528 138 V220" marker-end="url(#gta-arrow)"/>
</svg>
<figcaption>How the port is split. Everything a frame needs runs on the main thread at the original's own rates; everything that touches the world's 900 MB of data runs in workers.</figcaption>
</figure>

The simulation steps at a fixed 60 Hz, and with the frame limiter on, the default, the renderer draws at most 30 frames a second. Rendering is three.js on WebGL. Physics is Rapier, compiled to WebAssembly and shipped as its own file (2 MB, 0.76 MB compressed), so the browser compiles it while it downloads and keeps it compiled between visits.

The target is written at the top of an 11,724-line fidelity audit: "one-to-one original PC 1.0 behavior and presentation, across the entire game. No subsystem is accepted merely because its browser implementation exists or its unit tests pass." Most systems are ported from gta-reversed, the community's reconstruction of the PC game's code. Where that reconstruction only has a stub, the port follows the iOS release's executable instead, citing the addresses of the functions it reads.

## Streaming a state

The world's main archive is a single 937 MB file. web-gta republishes it as 1,943 gzip chunks of up to 512 KB each, kept in the archive's own order and named by their hash. A manifest maps each of the archive's 16,297 entries to a chunk and an offset. The order turned out to matter. An earlier packing grouped entries by type into 4 MB chunks, so the window around Grove Street read 80.4 MB to get the entries it needed. In archive order, entries that sit together on the map also sit together in the file, and the same window reads 30.8 MB. On a throttled 50 Mbps connection the play button came up at 5.6 seconds instead of 8.1.

The world streams in windows: full detail within 180 units of a point, low-detail stand-ins out to 1,000. A small class, the region follower, decides when to ask for the next one. It aims at a point ahead of the car. Once that point drifts 30% of a radius from the loaded window's centre, it requests a new window there. If the car gets more than 85% of the way to the edge before the new window arrives, the game holds. Figure 2 runs that class on an empty straight road.

<figure class="fig" id="gta-stream">
<figcaption>web-gta's region follower on a made-up straight road: 60 seconds of driving, with each window taking a fixed time to load. The follower is the port's own code; the road, the speeds and the loading times are not.</figcaption>
</figure>

<a class="act" href="#gta-stream" data-speed="70" data-latency="2" data-lead="fixed">At 70 m/s with windows that take two seconds</a>, the car never waits. <a class="act" href="#gta-stream" data-speed="70" data-latency="2.1" data-lead="fixed">Add a tenth of a second</a> and it starts to hold, and <a class="act" href="#gta-stream" data-speed="70" data-latency="3" data-lead="fixed">at three seconds</a> it spends 18 of its 60 seconds held. <a class="act" href="#gta-stream" data-speed="70" data-latency="3" data-lead="adaptive">Looking further ahead</a> barely helps at that speed, because the look-ahead is capped at 80% of the window's radius. The only real fix is faster windows.

That is how it went in the game too. When holds were reported as painful on September 19, a scripted probe drove a 90-second diagonal at 70 m/s. Each window took 1.3 to 1.9 seconds in the worker, and the drive held 53 times, for 28.6 seconds in all. The worker had been decoding every model in a window and only then dropping the ones already resident; it now skips them before decoding. Collision and vegetation data that it re-read for every window is now cached. And the follower leads by the measured loading time plus 0.8 seconds instead of a fixed two. A window now takes 60 to 350 ms, and the same drive holds once, at its start, for 1.4 seconds. A two-minute flight in a Rustler streamed 52 windows without a single hold.

The chunks themselves are kept in Cache Storage, named by hash, so a returning player streams the parts of the map they have visited without a network. Two changes moved most of a second of work off the critical path. A chunk read back from storage is no longer hashed again; the gzip CRC checks it as it inflates, which saved about 220 ms of SHA-256 and as much again of garbage collection. And fetching, storing and inflating moved to a worker of their own, taking 500 to 600 ms off the thread that draws frames.

## Running the original scripts

San Andreas's story is a program. Missions, side jobs, cutscene timing and most of what makes the world feel alive are written in a bytecode language and compiled into `main.scm` plus about two hundred mission and streamed scripts. web-gta doesn't reimplement the missions; it runs that bytecode. An instruction is a two-byte opcode followed by typed parameters, each led by a type byte: a 32-bit number, a 16-bit one, an 8-bit one, a local variable. Scripts are cooperative threads. Each frame, every thread runs until it hits a `WAIT`, which sets the time it wakes up and yields. Conditions set a flag that the next jump reads. Figure 3 is the port's own interpreter running a script I assembled by hand.

<figure class="fig wide" id="gta-vm">
<figcaption>web-gta's script decoder and interpreter, running a six-instruction script assembled for this page. The listing is the decoder's output; the state on the right is read from the running thread. The bar below is the port's census of the commands the original scripts actually use.</figcaption>
</figure>

Step through it and the shape of the language shows. `SET_LVAR_INT` and `ADD_VAL_TO_INT_LVAR` write the thread's local variable `0@`. `IS_INT_LVAR_GREATER_THAN_NUMBER` sets the condition flag, and `GOTO_IF_FALSE` loops while it is false. <a class="act" href="#gta-vm" data-wait="1000" data-play="1">Make the wait a full second</a> and the thread spends almost all its time asleep, which is what most of the game's script threads are doing at any moment.

Interpreting the bytecode is the easy half. The hard half is the commands: the opcode table lists 2,637 of them, and the original scripts use 1,570 distinct ones at 416,669 places. Each needs the engine behind it: spawn this car, set this ped's task, fade the screen, start this phone call. The port keeps a census. Of the 1,570, 1,244 follow the reference or the iOS executable, 153 are core control flow, and 127 are still skipped. A skipped command doesn't end the mission: its outputs read as "nothing found" and the script carries on. That is why a headless mission sweep can say how far each mission gets before it stops. Under the sweep's bot, four missions currently run to their pass.

## Traffic from the original arithmetic

Ambient traffic is a port of CCarCtrl, the original's traffic controller. Cars pick routes through the original road links, steer with the original controller and slow down for whatever is in front of them. Figure 4 is the function that decides how hard a car brakes for the car ahead.

<figure class="fig" id="gta-traffic">
<figcaption>The port of <code>CCarCtrl::SlowCarDownForOtherCar</code>, with two made-up cars 4.8 units long. The curve is the speed the follower aims for at each gap; drag the car ahead to move along it.</figcaption>
</figure>

Most of the curve is what you'd expect. The controller only calls this function for a car inside the zone ahead, and any car there caps the follower at about 62% of its cruising speed. Closer, it slows in proportion to how soon the boxes would touch. Then come three branches in a row, and <a class="act" href="#gta-traffic" data-gap="7">close up the curve does something odd</a>: if the cars would touch within one unit, stop; within three, crawl at speed 1; otherwise scale the speed by how far off contact is, which reaches zero just before three units. At a cruise speed of 20, a car stands still with a gap of 8 to 9 units, but creeps forward at 6 to 8: closer than the place where it stopped, it moves again. That is what the port's formula does, following reVC's version of the original. Whether the retail game does exactly this is the kind of question the fidelity audit keeps open rather than assumes.

The bugs that hurt most here weren't in the arithmetic. Pedestrians culled from the list were never removed from the physics world. On a rooftop 84 m above downtown, about ten Rapier bodies leaked every second, and within a minute the pedestrian step went from 0.3 ms to 400 ms a frame. Elsewhere, a traffic car retired mid-loop left another driver's danger scan reading its freed physics body, and after about 40 seconds Rapier threw `unreachable` on every frame. Both were found by the same route probe that measured the streaming holds.

## Fitting on a phone

A phone is the hard target: less memory, a GPU that pays for every pixel, and a processor that slows down as it warms. Three of the answers are small enough to show.

**The resolution follows the frame rate.** On a touch device, the game watches the median frame time over three seconds. If it is slower than 26 fps, it drops a step down a resolution ladder (100%, 85%, 72%, 60%). If the step down didn't help, the GPU wasn't the problem, so it undoes it and leaves the resolution alone for a minute, doubling the wait each time. After thirty seconds of keeping up, it tries a step back up.

<figure class="fig" id="gta-res">
<figcaption>web-gta's adaptive-resolution controller on three made-up phones. Grey is frame time; blue is the resolution scale the controller chose, with a dot at each decision.</figcaption>
</figure>

<a class="act" href="#gta-res" data-kind="gpu" data-base="45">A phone whose GPU is the bottleneck</a> drops to 85% after three seconds, tries full resolution again at 33, finds it slow and comes back down, then waits twice as long before the next try. <a class="act" href="#gta-res" data-kind="cpu" data-base="45">When the CPU is the bottleneck</a>, fewer pixels don't help, so the controller undoes its step after one window and stops trying for a minute. <a class="act" href="#gta-res" data-kind="warm" data-base="45">A phone that warms up</a> keeps full resolution for its first minute and steps down once it slows.

**Textures are decoded to half the memory.** The PC game's textures are compressed in the DXT formats, which few phone GPUs can sample. So they are decoded as they stream in. DXT1, most of the world, decodes to 16-bit colour with a 1-bit alpha instead of 32-bit RGBA. Around Grove Street that is 46 MB instead of 93, which took texture memory from about 108 MB to 62. Letting go of the decoded copy once the GPU has it saved about 60 MB more of the page's own memory. Figure 6 is one 4 × 4 block through the port's decoder.

<figure class="fig" id="gta-dxt">
<figcaption>One DXT1 block, 8 bytes, decoded by the port both ways: two endpoint colours, the colours between them, and a 2-bit index for each of the 16 pixels. Pick the endpoints and click the indices.</figcaption>
</figure>

The format has a trick in it. If the first endpoint is the larger 16-bit number, the block has four colours. If it isn't, the fourth index means "transparent", which is how DXT1 carries cut-out foliage and fences in the same 8 bytes. <a class="act" href="#gta-dxt" data-swap="1">Swap the endpoints</a> and watch index 3 go clear. The 16-bit decode keeps that one bit of alpha. What it gives up is a bit of green and the finest steps of the blends, which is hard to see on a phone's screen.

**The thumb gets a gentler stick.** The touch controls come from the iOS port's own layout files, and steering follows its curve. A third of the stick's travel steers about a fifth of the way, so a thumb can make small corrections at speed; the rest of the travel opens up to full lock.

<figure class="fig" id="gta-steer">
<figcaption>The port's touch-stick steering curve. The shaded band is the low range, where the stick is deliberately soft.</figcaption>
</figure>

## What I would tell myself in September

- **Write the target down, with the bar for "done".** "No subsystem is accepted merely because its browser implementation exists or its unit tests pass" ruled out a whole class of shortcuts before they were tempting.
- **Build the probe before the fix.** The route probe that drives a scripted path and prints holds, heap and physics bodies every ten seconds found the streaming holds, the pedestrian leak and the freed handle. None of them showed up in a unit test.
- **Count what's left.** "How much of the game works?" has no answer. "1,244 of 1,570 commands faithful, 127 skipped" does, and it says what to port next.
- **A phone needs a budget for everything.** Every cache in the port has a phone size: decoded chunks, retired models, decoded textures. Without them, a long drive on a phone grows until the browser closes the page.

If you have a desktop with a keyboard, [open web-gta](https://sir-teo.github.io/web-gta/) and drive west down Grove Street.
