---
layout: post
title: "Drawing 6,684 ideas in one dependency graph"
description: >-
  How theorems-visualizations wires 6,684 theorems, laws, models, and
  mechanisms across 85 collections and 13 fields into a single directed
  acyclic graph—running 6,621 interactive canvas simulations on one zero-build
  runtime and verifying every frame headlessly.
image: /assets/social/drawing-six-thousand-ideas-in-one-dependency-graph.png
date: 2026-10-18 18:00:00 -0400
excerpt: >-
  It started as one live figure for every result in Rudin's analysis books and
  grew into 6,684 ideas across 13 fields, each linked to what it depends on.
  How the graph is built, what it shows, and how thousands of simulations get
  checked without anyone looking at them.
links:
  - title: Live atlas
    url: https://sir-teo.github.io/theorems-visualizations/#/
  - title: Source
    url: https://github.com/Sir-Teo/theorems-visualizations
styles:
  - /assets/css/theorems-visualizations.css
scripts:
  - /assets/js/theorems-visualizations-core.js
  - /assets/js/theorems-visualizations.js
---

**Ideas, visualized** started as an interactive companion to Walter Rudin's three analysis textbooks: one live figure for each of their 1,062 numbered theorems, lemmas, and definitions. It grew into an atlas of 6,684 ideas across 13 fields, from real analysis and quantum mechanics to map projections and sociology. Each idea lists the ideas it depends on, and nearly every one has its own interactive simulation.

A collection that size raises two questions. What does the graph of all those dependencies look like? And how do you keep 6,621 simulations working when nobody can click through them all? This post covers both. Every figure runs the atlas's own canvas runtime on its compiled graph.

## One build step, no bundler

<figure class="fig wide" id="tv-arch">
<svg class="arch" viewBox="0 0 760 254" role="img" aria-label="Architecture: content/<col>/chNN.js modules, syllabus.js inventories, and bridges/*.js walks compile through scripts/build.mjs into data/index.json, 85 collection shards, and OKLCH CSS variables; in the browser, app.js and viz/core.js + math.js + 17 kits mount live canvas simulations; scripts/check.mjs and 161 verification suites audit every item in headless Chromium and Node.">
<defs>
<marker id="tv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="12" y="12" width="236" height="54" rx="6"/>
<text class="t" x="130" y="30">content/&lt;col&gt;/chNN.js</text>
<text class="st" x="130" y="48">85 collections · 6,684 items · viz(v)</text>
<rect class="box" x="264" y="12" width="232" height="54" rx="6"/>
<text class="t" x="380" y="30">content/&lt;col&gt;/syllabus.js</text>
<text class="st" x="380" y="48">6,890 planned · 450 landmark papers</text>
<rect class="box" x="512" y="12" width="236" height="54" rx="6"/>
<text class="t" x="630" y="30">content/bridges/*.js</text>
<text class="st" x="630" y="48">8 cross-field walks · 104 steps</text>
<path class="edge-strong" d="M130 68 V96" marker-end="url(#tv-arrow)"/>
<path class="edge-strong" d="M380 68 V96" marker-end="url(#tv-arrow)"/>
<path class="edge-strong" d="M630 68 V96" marker-end="url(#tv-arrow)"/>
<rect class="box em" x="12" y="98" width="736" height="56" rx="6"/>
<text class="t" x="380" y="116">scripts/build.mjs (DAG validation · transitive closure · 8-sweep barycentre layout · OKLCH palette)</text>
<text class="st" x="380" y="135">data/index.json · data/planned.json · data/col/&lt;id&gt;.json (85 shards) · data/atlas.css</text>
<path class="edge-strong" d="M210 156 V184" marker-end="url(#tv-arrow)"/>
<text class="el" x="268" y="173">dynamic import()</text>
<path class="edge-strong" d="M566 156 V184" marker-end="url(#tv-arrow)"/>
<text class="el" x="626" y="173">Playwright + Node</text>
<rect class="box" x="12" y="186" width="396" height="56" rx="6"/>
<text class="t" x="210" y="204">assets/js/viz/core.js + math.js + 17 domain kits</text>
<text class="st" x="210" y="223">2D/3D stages · handles · RK45 / FFT / SVD / quantum · KaTeX</text>
<rect class="box" x="424" y="186" width="324" height="56" rx="6"/>
<text class="t" x="586" y="204">scripts/check.mjs + 161 test suites</text>
<text class="st" x="586" y="223">headless Chromium · 6,906 numerical assertions</text>
</svg>
<figcaption>Each chapter is a plain ES module under <code>content/&lt;col&gt;/</code>. <code>scripts/build.mjs</code> resolves the global dependency DAG and writes static JSON shards; the browser imports chapter modules directly with no bundler.</figcaption>
</figure>

Adding a collection takes a folder with a `collection.js` descriptor and one module per chapter. Each item in a chapter exports four things: a `statement`, the `idea` behind it, its `deps` (the items it builds on), and `viz(v)`, the function that draws its simulation. The browser imports those modules directly, with no bundler in between.

One build script does the rest on disk. It checks that all 11,541 dependency edges form a graph with no cycles (no idea can depend, however indirectly, on itself), works out every item's complete set of ancestors and descendants, lays the chapters out on 88 shelf rows so that edges cross as little as possible, and picks a light and dark color for each collection. Each collection also keeps a syllabus of planned items, 6,890 so far, that the build tracks separately from the ones already written.

## 6,684 ideas in one graph

<figure class="fig wide" id="tv-map" style="--reserve: 740px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>All 6,684 written ideas and 11,541 dependency edges across 85 collections and 13 fields. <span class="only-hover">Click or drag</span><span class="only-touch">Tap or drag</span> on the atlas to pan and zoom, select any node to light up its full transitive prerequisite and descendant cones, switch to the 13-field chord matrix, or scrub the 77-step longest reasoning chain.</figcaption>
</figure>

Because dependencies cross chapters, books, and fields, one click shows how far an idea travels. <a class="act" href="#tv-map" data-view="atlas" data-node="pma-1.5">An order on a set</a>, Rudin's Definition 1.5, has no prerequisites of its own and 3,286 descendants: nearly half the atlas rests on it. <a class="act" href="#tv-map" data-view="atlas" data-node="ladr-7.29">The real spectral theorem</a> feeds 664 results across mechanics, quantum theory, and statistics.

Step back to whole fields and <a class="act" href="#tv-map" data-view="flows" data-field="math">1,989 links cross from one field to another</a>, most of them carrying mathematics into physics (446), engineering, statistics, computer science, and economics. The <a class="act" href="#tv-map" data-view="chain" data-step="76">longest chain</a> runs 77 steps without a break, from that order on a set, through complex and functional analysis, wave mechanics, and quantum gates, to Grover's search algorithm.

## Thirteen fields, one canvas runtime

<figure class="fig wide" id="tv-workbench" style="--reserve: 680px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Thirteen live simulations—one from each field—mounted directly by <code>assets/js/viz/core.js</code>. Switch fields, drag handles and sliders on the canvas, flip hypotheses, or open the <code>viz(v)</code> source drawer to see the declarative stage calls behind each picture.</figcaption>
</figure>

Every simulation is written against the same 3,531-line runtime and 17 kits for particular domains. Instead of a static diagram, each one exposes the quantity that the theorem or mechanism controls, so you can break an assumption and watch the conclusion fail.

<a class="act" href="#tv-workbench" data-item="pma-4.19" data-seg="2">Break compactness in Rudin 4.19</a> by opening the interval to (0, 1], and the largest $$\delta(p)$$ that works collapses to zero near the missing endpoint: uniform continuity needed that endpoint. <a class="act" href="#tv-workbench" data-item="geog-4.4" data-seg="0">Drag Greenland to the equator</a> and it sheds the area inflation Mercator gives it, $$\sec^2\varphi$$, about 14×. <a class="act" href="#tv-workbench" data-item="tech-2.9" data-toggle="0">Snap one tooth off the Antikythera mechanism's `b1` gear</a> and its Metonic pointer starts to drift.

The same runtime draws the rest of the atlas, from <a class="act" href="#tv-workbench" data-item="mech-8.22">Kepler orbits</a>, whose velocities trace an exact circle, to <a class="act" href="#tv-workbench" data-item="imaging-3.3">a CT scan rebuilt from its projections</a> and <a class="act" href="#tv-workbench" data-item="soc-1.2">a city tipping into segregation</a>.

## One mathematical spine, many disguises

<figure class="fig wide" id="tv-bridges" style="--reserve: 690px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Eight cross-field bridges (104 steps) and 450 landmark papers (350 BCE – 2020 CE) across the 13 field lanes. Select a bridge and click any step along its track to run that step's interactive simulation live below the swimlane.</figcaption>
</figure>

The same mathematics keeps turning up under other names, so the atlas has eight *bridges*: guided walks that follow one idea across fields.

<a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="spectral" data-step="2">The spectral bridge</a> starts with self-adjoint matrices and ends with <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="spectral" data-step="8">standing waves on a string</a>. <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="entropy" data-step="2">The entropy bridge</a> goes from Boltzmann's counting of microstates to <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="entropy" data-step="8">Landauer's bound</a>: erasing one bit of information costs at least $$k_{\mathrm B}T\ln 2$$ of heat. <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="fixed-points" data-step="1">The fixed-point bridge</a> connects Banach's contraction theorem to <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="fixed-points" data-step="7">PageRank</a>.

Switch to <a class="act" href="#tv-bridges" data-mode="papers">the 450 landmark papers</a> to see each primary source on a timeline from 350 BCE to 2020, beside the ideas it introduced.

## Checking 6,621 canvases without looking

<figure class="fig wide" id="tv-audit" style="--reserve: 580px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Coverage across all 85 collections and live numerical audits from <code>scripts/check.mjs</code> and the 161 <code>tests/verification-*.test.mjs</code> suites (1,058 tests, 6,906 assertions).</figcaption>
</figure>

No one can click through 6,621 simulations after every change, so the checks run at two levels.

The first is mechanical. In headless Chromium, `scripts/check.mjs` mounts every item in a test page, clicks through every segmented control and toggle, and confirms each visible canvas actually paints something. It also catches broken TeX escapes and missing live readouts. <a class="act" href="#tv-audit" data-case="harness">The coverage view</a> shows that sweep across all 85 collections.

The second is numerical, and it catches bugs a screenshot never would. In Node, 161 verification suites test the simulations' solvers against independent calculations and published data. In the Fourier CT simulation (`imaging-3.4`), they caught <a class="act" href="#tv-audit" data-case="radon">a reconstruction discarding the imaginary parts at negative <span class="math-inline" data-tex="k_x">kₓ</span>, and a detector sampled too coarsely, below the Nyquist rate</a>. In population genetics (`popgen-4.2`), a suite <a class="act" href="#tv-audit" data-case="popgen">separates the exact selection model, <span class="math-inline" data-tex="\ln(1+s)">ln(1 + s)</span> per generation, from the weak-selection shortcut <span class="math-inline" data-tex="s">s</span></a>, which is only right when <span class="math-inline" data-tex="s">s</span> is small.

At this size, the atlas can't be proofread by eye. The build keeps its structure honest, and the verification suites keep its numbers honest. What neither can check is whether a simulation actually helps someone understand the idea. That still takes a reader.
