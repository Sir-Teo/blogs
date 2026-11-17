---
layout: post
title: "Rendering twenty-two hours of math from code"
description: >-
  How explainer-videos compiles twenty-four feature-length math, physics, ML,
  and markets films from Python—synchronizing Manim geometry to word-level TTS
  bookmarks in English and Chinese, enforcing a 222-token semantic color
  palette, and scanning every frame for dead air.
image: /assets/social/rendering-twenty-two-hours-of-math-from-code.png
date: 2026-10-18 08:00:00 -0400
excerpt: >-
  Twenty-four feature-length math, physics, and ML films with no video editor
  involved. The narrator's voice sets the timing, so translating a film needs
  no re-editing, and a pixel scanner watches all twenty-two hours for dead air.
links:
  - title: Channel
    url: https://www.youtube.com/@teozeng3999
  - title: Source
    url: https://github.com/Sir-Teo/explainer-videos
styles:
  - /assets/css/explainer-videos.css
scripts:
  - /assets/js/explainer-videos.js
---

**explainer-videos** is how I make long-form films about mathematics, physics, machine learning, and markets: 24 so far, 16.4 hours in English plus 5.6 hours of Chinese versions. Thirteen of them are on [my YouTube channel](https://www.youtube.com/@teozeng3999), from [the Navier–Stokes equations](https://youtu.be/ULc5slvLoew) to [how large language models work](https://youtu.be/o0ENWGEVJm0).

There's no video editor in the process. Every frame, equation, simulation, narration line, and subtitle is generated from Python with [Manim Community](https://www.manim.community/) and local neural text-to-speech, and no video files are kept in git. A film is source code, and making one is a build.

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

Each film is a folder: a `compute.py` that runs the numerical simulations ahead of time, one Python file per scene, and the narration. Rendering a sixty-minute film in parallel ran into two limits in stock Manim. Scene processes running at once raced on shared LaTeX files, and frame-by-frame numeric readouts grew Manim's internal SVG dictionary past 6 GB of memory. `tools/build.py` gives every scene worker its own TeX directory, starts the longest scenes first so a short one never ends up waiting at the back of the queue, and replaces that dictionary with a cache capped at 400 entries.

## Twenty-four films, frame by frame

<figure class="fig wide" id="ev-atlas" style="--reserve: 760px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption>All 24 completed films in the repository (16.4 hours in English, plus 5.6 hours of Chinese masters for <em>Analysis, Built</em>). Every horizontal ribbon is the film's vertical color profile over time; <span class="only-hover">click or drag</span><span class="only-touch">tap or drag</span> across any ribbon to inspect its rendered frames, subtitle track, and active-pixel density.</figcaption>
</figure>

Each strip above squeezes a whole film into 300 thin slices of color, so you can see its structure before pressing play. Look for <a class="act" href="#ev-atlas" data-film="navier_stokes" data-sample="4">the Kármán vortex street</a> in *Navier–Stokes*, where blue velocity gives way to orange vorticity; <a class="act" href="#ev-atlas" data-film="riemann" data-sample="1">the rainbow phase portrait of ζ(s)</a> in [*The Riemann Hypothesis*](https://youtu.be/1vG6NoYvbN4); or <a class="act" href="#ev-atlas" data-film="llm" data-sample="4">the orange attention matrices and purple MLP blocks</a> in *How LLMs Work*.

## The voice is the clock

<figure class="fig wide" id="ev-score" style="--reserve: 670px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption><code>Contraction</code> (<code>videos/analysis/analysis4/s05_contraction.py</code>) rendered in English (144.8 s) and Chinese (151.3 s) from the same scene class. The 57 <code>self.play()</code> segments run for the exact same 58.6 s in both languages; the 25 <code>vo.wait_until()</code> holds stretch or contract around each language's word timestamps.</figcaption>
</figure>

Scenes never hard-code a pause. Instead, the narration carries inline `<bookmark mark='...'/>` tags. `VoiceoverScene` strips them out before synthesizing the speech and records the moment the next word starts:

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

Animations (`self.play()`) always take the same time. The waits (`vo.wait_until()`) absorb the difference in how fast each language speaks. That's why translating a film takes no editing at all: the Chinese version is the same scene code with a different voice. Compare <a class="act" href="#ev-score" data-beat="1" data-lang="en">the English cobweb</a> with <a class="act" href="#ev-score" data-beat="1" data-lang="zh">the Chinese render</a>: the drawing is identical and only the gaps between animations change.

## One color per concept, one rule per word

<figure class="fig wide" id="ev-palette" style="--reserve: 520px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption>The 222 semantic color tokens in <code>explainer/style.py</code> (referenced 11,085 times across 705 scene files) and the 513 regex-to-IPA pronunciation rules in <code>explainer/tts.py</code> (firing 2,808 times across the narration corpus).</figcaption>
</figure>

No scene uses a raw hex color. Every one imports a named role from `explainer/style.py`, so a concept keeps one color across a whole series: <a class="act" href="#ev-palette" data-mode="palette" data-group="Analysis, Built">tolerance bands in gold (`C.EPS`) and holes in coral (`C.HOLE`)</a> throughout *Analysis, Built*, or <a class="act" href="#ev-palette" data-mode="palette" data-group="Language Models & RL">queries, keys, values, and attention</a> throughout the machine learning films.

Pronunciation works the same way. A lexicon of 513 rules feeds phonetic spellings to the Kokoro voice so that <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="Poisson">`Poisson`</a> is never read as "poison", the differential <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="dy">`dy`</a> never becomes "die", and <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="F = m a">`F = m a`</a> stays two letters instead of "Emma".

## Hunting dead air

<figure class="fig wide" id="ev-qa" style="--reserve: 580px" data-src="{{ '/assets/data/explainer-videos-demo.json' | relative_url }}">
<figcaption><code>tools/dead_air.py</code> downscales every frame to <code>320×180</code> and flags runs lasting at least 1.5 s where fewer than 0.30% of pixels differ from <code>#0E1117</code>—catching scenes where a <code>vo.wait_until()</code> hold sat before the drawing call instead of after it.</figcaption>
</figure>

Checking twenty-two hours of 4K footage by watching it doesn't scale. `tools/dead_air.py` streams each render through `ffmpeg` at 320×180 and measures how much of every frame differs from the dark background. Any stretch of 1.5 seconds or more where under 0.30% of the pixels are lit (a lone title, bare axes) gets flagged.

The usual cause was one line in the wrong place: a `vo.wait_until()` placed *before* the `self.play()` it was meant to follow, so the drawing waited for a bookmark several sentences later while the screen sat nearly empty. The scanner found <a class="act" href="#ev-qa" data-case="balance">12.4 seconds of bare title before a router-load replay</a>, <a class="act" href="#ev-qa" data-case="width">14.5 seconds before a scaling card</a>, and <a class="act" href="#ev-qa" data-case="steering">8.0 seconds before a chain-of-thought schematic</a>. Across the eleven films in the two series, *Analysis, Built* and *AI, Built*, fixing what it found cut sparse stretches by 91%.

Each tool here replaces something I'd otherwise do by watching. The voice sets the timing, so there's no timeline to adjust. Colors and pronunciations are code, so each is decided once. And the scanner watches every frame, so I only have to watch the ones it flags.
