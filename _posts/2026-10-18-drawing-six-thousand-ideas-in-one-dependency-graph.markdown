---
layout: post
title: "Drawing 6,684 ideas in one dependency graph"
description: >-
  How theorems-visualizations wires 6,684 theorems, laws, models, and
  mechanisms across 85 collections and 13 fields into a single directed
  acyclic graph—running 6,621 interactive canvas simulations on one zero-build
  runtime and verifying every frame headlessly.
date: 2026-10-18 18:00:00 -0400
excerpt: >-
  Starting from all 1,062 results in Rudin's analysis trilogy and growing to
  6,684 ideas across 13 fields—how one dependency graph, a 3,500-line canvas
  runtime, 17 domain kits, and a headless Chromium verifier turn primary
  sources into interactive simulations.
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

**Ideas, visualized** started as an interactive companion to every numbered result in Walter Rudin's three analysis books (`1,062` theorems, lemmas, corollaries, propositions, and definitions) and expanded into a single directed acyclic graph of `6,684` ideas (`6,621` interactive canvas simulations plus `6,890` planned syllabus nodes) across `85` collections and `13` fields. Every interactive figure below runs the atlas's own zero-build canvas runtime (`assets/js/viz/core.js`, `math.js`, and its 17 domain kits) directly on the compiled graph.

## Zero build in the browser, one pass on disk

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

Adding a collection requires only a folder with a `collection.js` descriptor and chapter modules exporting `statement`, `idea`, `deps`, and `viz(v)`. On build, `scripts/build.mjs` verifies that all `11,541` dependency edges form a cycle-free DAG, computes each item's transitive ancestor and descendant closures, packs chapters into `88` shelf rows using eight forward-and-backward barycentre sweeps, and derives light and dark collection hues in perceptual OKLCH space.

## 6,684 ideas in one dependency graph

<figure class="fig wide" id="tv-map" style="--reserve: 740px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>All 6,684 written ideas and 11,541 dependency edges across 85 collections and 13 fields. <span class="only-hover">Click or drag</span><span class="only-touch">Tap or drag</span> on the atlas to pan and zoom, select any node to light up its full transitive prerequisite and descendant cones, switch to the 13-field chord matrix, or scrub the 77-step longest reasoning chain.</figcaption>
</figure>

Because `deps` cross chapter, book, and discipline boundaries, a single click traces how foundational definitions propagate across the entire graph: <a class="act" href="#tv-map" data-view="atlas" data-node="pma-1.5">an order on a set (`pma-1.5`)</a> sits at depth `0` with `3,286` downstream descendants; <a class="act" href="#tv-map" data-view="atlas" data-node="pma-4.19">uniform continuity on compact sets (`pma-4.19`)</a> bridges metric topology into integration and Fourier analysis; <a class="act" href="#tv-map" data-view="atlas" data-node="ladr-7.29">the real spectral theorem (`ladr-7.29`)</a> feeds `664` results across mechanics, quantum theory, and statistics; <a class="act" href="#tv-map" data-view="flows" data-field="math">the 1,989 cross-field links</a> carry mathematical structure into physics (`446`), engineering (`116`), statistics (`110`), computer science (`104`), and economics (`93`); and <a class="act" href="#tv-map" data-view="chain" data-step="76">the 77-step longest chain</a> runs unbroken from `pma-1.5` through complex and functional analysis, wave mechanics, and quantum gates to Grover's search algorithm (`cplx-13.9`).

## Thirteen fields, one canvas runtime

<figure class="fig wide" id="tv-workbench" style="--reserve: 680px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Thirteen live simulations—one from each field—mounted directly by <code>assets/js/viz/core.js</code>. Switch fields, drag handles and sliders on the canvas, flip hypotheses, or open the <code>viz(v)</code> source drawer to see the declarative stage calls behind each picture.</figcaption>
</figure>

Every simulation in the repository is written against the same `3,531`-line runtime (`core.js` + `math.js`) and `17` domain kits. Instead of static diagrams, each `viz(v)` exposes the quantity the proof or mechanism controls: you can <a class="act" href="#tv-workbench" data-item="pma-4.19" data-seg="2">break compactness on (0, 1] in `pma-4.19`</a> and watch the greatest admissible δ(p) collapse to zero near the missing endpoint, <a class="act" href="#tv-workbench" data-item="mech-8.22">drag the launch velocity in `mech-8.22`</a> as Keplerian velocities trace an exact circle in hodograph space, <a class="act" href="#tv-workbench" data-item="geog-4.4" data-seg="0">drag Greenland to the equator in `geog-4.4`</a> to shed its 14× sec²φ Mercator inflation, <a class="act" href="#tv-workbench" data-item="imaging-3.3">reconstruct a CT phantom from its Radon sinogram in `imaging-3.3`</a>, <a class="act" href="#tv-workbench" data-item="soc-1.2">tip an integrated city into segregation in `soc-1.2`</a>, or <a class="act" href="#tv-workbench" data-item="tech-2.9" data-toggle="0">snap one tooth off the Antikythera `b1` gear in `tech-2.9`</a> and watch the Metonic pointer drift.

## One mathematical spine, many disguises

<figure class="fig wide" id="tv-bridges" style="--reserve: 690px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Eight cross-field bridges (104 steps) and 450 landmark papers (350 BCE – 2020 CE) across the 13 field lanes. Select a bridge and click any step along its track to run that step's interactive simulation live below the swimlane.</figcaption>
</figure>

The same mathematical skeleton repeatedly reappears under different physical or social names. Following <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="spectral" data-step="2">the spectral theorem bridge</a> walks from self-adjoint matrices (`ladr-7.29`) and SVD (`ladr-7.70`) to <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="spectral" data-step="7">coupled normal modes (`mech-11.4`)</a> and <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="spectral" data-step="8">standing waves on a string (`music-2.3`)</a>; <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="entropy" data-step="2">the entropy bridge</a> links Boltzmann microstates (`thermo-5.6`) to <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="entropy" data-step="5">Shannon information (`info-1.2`)</a> and <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="entropy" data-step="8">Landauer's k<sub>B</sub>T ln 2 erasure bound (`thermo-5.17`)</a>; <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="fixed-points" data-step="1">the fixed-point bridge</a> connects Banach contraction (`pma-9.23`) to <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="fixed-points" data-step="4">Nash equilibria (`game-2.3`)</a> and <a class="act" href="#tv-bridges" data-mode="bridges" data-bridge="fixed-points" data-step="7">PageRank (`stoch-4.15`)</a>; and switching to <a class="act" href="#tv-bridges" data-mode="papers">the 450 landmark papers</a> plots each primary source on the field timeline alongside the graph nodes it introduced.

## Auditing 6,621 canvases without eyes

<figure class="fig wide" id="tv-audit" style="--reserve: 580px" data-src="{{ '/assets/data/theorems-visualizations-demo.json' | relative_url }}">
<figcaption>Coverage across all 85 collections and live numerical audits from <code>scripts/check.mjs</code> and the 161 <code>tests/verification-*.test.mjs</code> suites (1,058 tests, 6,906 assertions).</figcaption>
</figure>

Keeping `6,621` interactive canvases honest requires automated checks at two levels. In headless Chromium, `scripts/check.mjs --modes` mounts every item in `tools/harness.html`, clicks through every segmented control and toggle, verifies that every visible canvas paints non-transparent pixels, and flags raw-string TeX backslash escapes or missing live readouts. In Node, `161` primary-source verification suites test the underlying solvers against independent quadrature and published datasets—catching <a class="act" href="#tv-audit" data-case="radon">discarded negative-k<sub>x</sub> imaginary residuals and sub-Nyquist detector aliasing in Fourier CT (`imaging-3.4`)</a>, separating <a class="act" href="#tv-audit" data-case="popgen">exact discrete log-odds selection ln(1 + s) from the weak-selection s approximation (`popgen-4.2`)</a>, and auditing <a class="act" href="#tv-audit" data-case="harness">every control mode and primitive family across the 85 collections</a>.
