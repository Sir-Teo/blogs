---
layout: post
title: "Rendering twenty-two hours of math from code"
description: >-
  How explainer-videos compiles twenty-four feature-length math, physics, ML,
  and markets films from Python—synchronizing Manim geometry to word-level TTS
  bookmarks in English and Chinese, enforcing a 222-token semantic color
  palette, and scanning every frame for dead air.
date: 2026-10-18 08:00:00 -0400
excerpt: >-
  Twenty-four feature-length math, physics, and ML films built without a
  timeline editor—how word-level voiceover bookmarks, a 222-token semantic
  palette, a 513-rule IPA lexicon, and a pixel-coverage scanner turn Python
  packages into 4K masters.
links:
  - title: Channel
    url: https://space.bilibili.com/299736746
  - title: Source
    url: https://github.com/Sir-Teo/explainer-videos
styles:
  - /assets/css/explainer-videos.css
scripts:
  - /assets/js/explainer-videos.js
---

**explainer-videos** builds feature-length mathematics, physics, machine learning, and markets films entirely from Python with [Manim Community](https://www.manim.community/) and local neural text-to-speech. No video files or timeline projects live in git: every frame, equation, simulation, and subtitle track compiles from source.

## A film is a package

<figure class="fig" id="ev-arch">
<svg class="arch" viewBox="0 0 680 272" role="img" aria-label="Architecture: compute.py writes simulation checkpoints, sNN_*.py defines VoiceoverScene classes with semantic colors, and tts.py synthesizes cached WAVs with word timestamps through a 513-rule IPA lexicon; manim render runs scenes in parallel with isolated TeX caches; tools/build.py normalizes audio to ALAC, runs two-pass loudnorm, embeds subtitles and chapters, and hands the master to dead_air.py and contact_sheet.py.">
<defs>
<marker id="ev-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="16" y="16" width="202" height="54" rx="6"/>
<text class="t" x="117" y="34">compute.py</text>
<text class="st" x="117" y="51">NumPy · SciPy · mpmath → .npz</text>
<rect class="box" x="239" y="16" width="202" height="54" rx="6"/>
<text class="t" x="340" y="34">sNN_*.py + style.py</text>
<text class="st" x="340" y="51">VoiceoverScene · 222 C.* colors</text>
<rect class="box" x="462" y="16" width="202" height="54" rx="6"/>
<text class="t" x="563" y="34">tts.py + narration_zh.json</text>
<text class="st" x="563" y="51">Kokoro · Qwen3-TTS · 513 IPA rules</text>
<path class="edge-strong" d="M117 72 V100" marker-end="url(#ev-arrow)"/>
<path class="edge-strong" d="M340 72 V100" marker-end="url(#ev-arrow)"/>
<path class="edge-strong" d="M563 72 V100" marker-end="url(#ev-arrow)"/>
<rect class="box em" x="16" y="102" width="648" height="56" rx="6"/>
<text class="t" x="340" y="120">manim render (parallel scene workers, longest scene first)</text>
<text class="st" x="340" y="138">isolated TeX dir per worker · 400-SVG LRU cache · up to 2,000 cached segments per scene</text>
<path class="edge-strong" d="M340 160 V188" marker-end="url(#ev-arrow)"/>
<text class="el" x="350" y="178" style="text-anchor:start">.mp4 + .wav + .narration.json + .srt</text>
<rect class="box" x="16" y="190" width="396" height="56" rx="6"/>
<text class="t" x="214" y="208">tools/build.py</text>
<text class="st" x="214" y="226">soundtrack check · ALAC pad · 2-pass EBU R128 loudnorm · chapters</text>
<rect class="box" x="434" y="190" width="230" height="56" rx="6"/>
<text class="t" x="549" y="208">dead_air.py · contact_sheet.py</text>
<text class="st" x="549" y="226">320×180 pixel scan vs #0E1117</text>
<path class="edge-strong" d="M414 218 H432" marker-end="url(#ev-arrow)"/>
</svg>
<figcaption>Each video lives in <code>videos/&lt;series&gt;/&lt;name&gt;/</code> and compiles from numerical checkpoints, scene scripts, and cached neural speech into a chaptered master.</figcaption>
</figure>

Rendering a sixty-minute film in parallel exposes two bottlenecks in stock Manim: concurrent scene processes race on shared LaTeX files, and frame-by-frame numeric readouts fill `SVG_HASH_TO_MOB_MAP` past 6 GB of RAM. `tools/build.py` gives every scene worker its own TeX directory, orders jobs longest-first so a short scene never waits behind a long tail, and replaces Manim's unbounded SVG dictionary with a 400-entry LRU cache.

## Twenty-four films, frame by frame

<figure class="fig wide" id="ev-atlas" style="--reserve: 760px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption>All 24 completed films in the repository (16.4 hours in English, plus 5.6 hours of Chinese masters for <em>Analysis, Built</em>). Every horizontal ribbon is the film's vertical color profile over time; <span class="only-hover">click or drag</span><span class="only-touch">tap or drag</span> across any ribbon to inspect its rendered frames, subtitle track, and active-pixel density.</figcaption>
</figure>

Each barcode strip compresses a full render into 300 vertical slices against the `#0E1117` background, making a film's structure visible before pressing play. You can spot <a class="act" href="#ev-atlas" data-film="navier_stokes" data-sample="4">the Kármán vortex street</a> in *Navier–Stokes* where blue velocity gives way to orange vorticity, <a class="act" href="#ev-atlas" data-film="riemann" data-sample="1">the rainbow phase portrait of ζ(s)</a> in *The Riemann Hypothesis*, <a class="act" href="#ev-atlas" data-film="llm" data-sample="4">the orange attention matrices and purple MLP blocks</a> in *How LLMs Work*, and <a class="act" href="#ev-atlas" data-film="analysis7" data-sample="0">the domain-colored complex discs</a> opening *Analysis, Built* Part 7.

## The voice is the clock

<figure class="fig wide" id="ev-score" style="--reserve: 670px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption><code>Contraction</code> (<code>videos/analysis/analysis4/s05_contraction.py</code>) rendered in English (144.8 s) and Chinese (151.3 s) from the same scene class. The 57 <code>self.play()</code> segments run for the exact same 58.6 s in both languages; the 25 <code>vo.wait_until()</code> holds stretch or contract around each language's word timestamps.</figcaption>
</figure>

Scenes never hard-code pause durations. Instead, narration strings carry inline `<bookmark mark='...'/>` tags that `VoiceoverScene` strips before synthesis and maps to the exact start timestamp of the following word:

```py
with self.voiceover(
    "<bookmark mark='a'/> To solve cosine of x equals x, just iterate ... "
    "<bookmark mark='b'/> On the graph, bounce between the curve and the diagonal ..."
) as vo:
    self.play(FadeIn(head[0]), Create(ax), Create(dg), FadeIn(dl))
    vo.wait_until("a")
    self.play(Create(cg), FadeIn(cl))
    vo.wait_until("b")
    self.play(Create(web), run_time=4.0, rate_func=linear)
```

Because `self.play()` durations are fixed while `vo.wait_until()` absorbs the difference in speech cadence, translating a film requires zero timeline editing. Switching from <a class="act" href="#ev-score" data-beat="1" data-lang="en">the English cobweb</a> to <a class="act" href="#ev-score" data-beat="1" data-lang="zh">the Chinese render</a>, jumping to <a class="act" href="#ev-score" data-beat="2" data-lang="en">the shrinking Cauchy discs in Rudin 9.23</a>, or zooming ×127 into <a class="act" href="#ev-score" data-beat="3" data-lang="en">the √2 ∉ ℚ hole</a> runs the exact same 82 Manim segments in lockstep with each voice.

## One color per concept, one IPA rule per term

<figure class="fig wide" id="ev-palette" style="--reserve: 520px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption>The 222 semantic color tokens in <code>explainer/style.py</code> (referenced 11,085 times across 705 scene files) and the 513 regex-to-IPA pronunciation rules in <code>explainer/tts.py</code> (firing 2,808 times across the narration corpus).</figcaption>
</figure>

Across all 705 scene files, mobjects never pass raw hex strings; they import semantic roles from `explainer/style.py`—<a class="act" href="#ev-palette" data-mode="palette" data-group="Analysis, Built">tolerance bands in gold (`C.EPS`) and holes in coral (`C.HOLE`)</a> across *Analysis, Built*, or <a class="act" href="#ev-palette" data-mode="palette" data-group="Language Models & RL">queries, keys, values, and attention</a> across the ML films. On the audio side, <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="Poisson">a 513-rule pronunciation lexicon</a> injects inline IPA into Kokoro's G2P front-end so `Poisson` is never read as *"poison"*, <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="dy">the differential `dy`</a> never becomes *"die"*, and <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="F = m a">`F = m a`</a> stays two letters instead of *"Emma"*.

## Hunting dead air

<figure class="fig wide" id="ev-qa" style="--reserve: 580px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption><code>tools/dead_air.py</code> downscales every frame to <code>320×180</code> and flags runs lasting at least 1.5 s where fewer than 0.30% of pixels differ from <code>#0E1117</code>—catching scenes where a <code>vo.wait_until()</code> hold sat before the drawing call instead of after it.</figcaption>
</figure>

Watching twenty hours of 4K renders at real-time speed to check whether an equation appeared on time does not scale. `tools/dead_air.py` streams a render through `ffmpeg` at `320×180` and measures the fraction of pixels brighter than the `#0E1117` background, flagging any stretch of 1.5 seconds or longer below `0.30%` (a lone header or bare axes). Running it across the series caught places where a `vo.wait_until()` call sat *before* `self.play()`—leaving <a class="act" href="#ev-qa" data-case="balance">12.4 seconds of bare title before the router load replay</a>, <a class="act" href="#ev-qa" data-case="width">14.5 seconds before the μP scaling card</a>, or <a class="act" href="#ev-qa" data-case="steering">8.0 seconds before the chain-of-thought faithfulness schematic</a>—and cut sparse stretches across the eleven series films by 91%.
