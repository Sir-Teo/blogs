---
layout: post
title: "The Ruler Is a Ratio"
description: "Weber's law, Fechner's logarithmic scale, and Stevens' power law are not three interchangeable slogans. They are different ways to turn physical intensity into a perceptual ruler."
date: 2026-06-17 10:30:00 -0400
categories: psychology
tags: [psychophysics, weber-law, fechner-law, stevens-power-law, perception, measurement, psychology]
excerpt: "A just-noticeable difference is not an absolute unit. If the internal ruler is logarithmic, the same perceptual step costs a fixed ratio of the background stimulus."
---

A candle is easy to notice in a dark room.

The same candle vanishes beside a floodlight.

That is not a failure of arithmetic. It is the measurement problem that made
psychophysics interesting in the first place. Physical intensity has units:
grams, candela, hertz, pressure, concentration. Perceptual intensity has to be
inferred from reports, choices, reaction times, matches, and thresholds.

So the first question is not:

```text
how much stimulus was added?
```

It is:

```text
what ruler did the observer have available?
```

## Weber's Ruler Starts at the Background

The Weber-style threshold statement is:

$$
\frac{\Delta I}{I} \approx k.
$$

The increment $$\Delta I$$ needed for a just-noticeable change is roughly
proportional to the current intensity $$I$$. The constant $$k$$ is the Weber
fraction for that task, modality, and experimental setup.

This is a local claim about discriminability. It does not say that all senses
use the same fraction, that thresholds are perfectly constant, or that
perception literally computes ratios. It says that, over useful regions, the
background stimulus is part of the unit.

Ernst Heinrich Weber's 1834 work on touch and related senses is one of the
classic sources behind this threshold tradition.[^weber] The modern slogan is
cleaner than the experiments that produced it. That is normal. Threshold
measurement is a protocol: present a standard, present a comparison, choose a
criterion such as 75% correct, estimate the difference that reaches it, and
only then print a number.

So I prefer to write Weber's law as a testable receipt:

```text
same observer
same task
same decision criterion
different pedestal intensities
approximately constant Delta I / I
```

When that receipt holds, a difference threshold is not a fixed physical amount.
It is a fixed relative amount.

## Fechner Integrates the Thresholds

Gustav Fechner's move in *Elemente der Psychophysik* was to turn those local
thresholds into a scale.[^fechner]

If equal just-noticeable differences are treated as equal perceptual steps, and
if $$\Delta I/I$$ is roughly constant, then the differential form is:

$$
dS = c \frac{dI}{I}.
$$

Integrating gives:

$$
S(I) = c \log I + C.
$$

That is the Weber-Fechner logarithmic scale. It has a very particular
interpretation. Equal ratios of physical intensity produce equal differences on
the Fechner scale:

$$
\log(2I) - \log(I) = \log 2.
$$

The logarithm did not fall from the sky. It is what you get when the local
unit of stimulus is proportional to the stimulus already present.

This is also where the law can be overread. The derivation depends on treating
threshold steps as equal subjective intervals. That is an assumption about how
to build a scale from discrimination data. It is powerful, but it is not the
only possible measurement protocol.

## Stevens Changes the Question

S. S. Stevens pushed a different method: ask people to assign numbers to
perceived magnitude, or to produce stimuli that match requested numerical
ratios. In his 1957 paper "On the Psychophysical Law", he argued that many
continua are better summarized by a power function:[^stevens]

$$
\psi(I) = k I^a.
$$

The exponent $$a$$ depends on the sensory continuum. A compressive continuum
has $$0<a<1$$. An expansive one has $$a>1$$. A linear one has $$a=1$$.

That does not simply "disprove the logarithm." It changes the measurement
question. Fechner's scale is built by counting threshold-sized differences.
Stevens' scale is built from direct magnitude judgments. Those procedures need
not identify the same ruler.

The useful reading is:

```text
threshold protocol -> Weber fractions and Fechner integration
magnitude protocol -> Stevens power functions
```

If you mix the protocols, the argument becomes mostly vocabulary.

## Lab: Move the Ruler

The lab below compares three internal rulers:

- a linear ruler, $$g(I)=I$$;
- a logarithmic ruler, $$g(I)=\log I$$;
- a power ruler, $$g(I)=I^a$$.

All three are normalized so that at the reference intensity they have the same
just-noticeable relative change. With the default settings, that reference is
`16` and the Weber fraction is `8%`, so every ruler is forced to agree there:

```text
JND at I = 16: Delta I = 1.28
Delta I / I = 8%
```

Then the lab asks what happens away from the reference point. At intensity
`64`, the default run gives:

```text
log ruler:    Delta I / I = 8.00%
linear ruler: Delta I / I = 2.00%
power ruler:  Delta I / I = 3.45%
```

Only the logarithmic ruler keeps the Weber ratio constant across the stimulus
range. That is the whole Fechner move in one plot.

<style>
  .psychophysics-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
  }

  .psychophysics-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .psychophysics-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .psychophysics-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .psychophysics-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .psychophysics-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .psychophysics-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .psychophysics-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .psychophysics-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.86rem, 2.4vw, 1.02rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .psychophysics-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .psychophysics-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 640px) {
    .psychophysics-lab {
      padding: 0.75rem;
    }

    .psychophysics-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="psychophysics-lab" data-psychophysics-lab>
  <div class="psychophysics-lab__controls">
    <label>
      Weber fraction <output data-value="weber">8%</output>
      <input type="range" data-param="weber" min="2" max="30" step="1" value="8" aria-label="Reference Weber fraction">
    </label>
    <label>
      Power exponent <output data-value="exponent">0.60</output>
      <input type="range" data-param="exponent" min="0.25" max="1.6" step="0.05" value="0.6" aria-label="Stevens power exponent">
    </label>
    <label>
      Detection criterion <output data-value="criterion">75%</output>
      <input type="range" data-param="criterion" min="60" max="90" step="1" value="75" aria-label="Two alternative forced choice criterion">
    </label>
    <label>
      Reference intensity <output data-value="reference">16</output>
      <input type="range" data-param="reference" min="4" max="64" step="1" value="16" aria-label="Reference intensity">
    </label>
    <label>
      Max intensity <output data-value="maxIntensity">128</output>
      <input type="range" data-param="maxIntensity" min="48" max="512" step="8" value="128" aria-label="Maximum displayed intensity">
    </label>
  </div>
  <div class="psychophysics-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Psychophysical scaling lab comparing linear, logarithmic, and power-law internal rulers"></canvas>
  <p class="psychophysics-lab__note" data-note>
    Loading psychophysical scaling audit.
  </p>
</div>

<script defer src="{{ '/assets/js/psychophysics-scale-lab.js?v=20260617a' | relative_url }}"></script>

## What the Four Panels Are Checking

The first panel draws the candidate internal rulers after normalizing their
vertical ranges. This is the part people usually argue about: is subjective
magnitude logarithmic, a power function, linear over some range, or something
else?

The second panel is the threshold audit. It asks a more local question:

$$
\text{how large must } \Delta I/I \text{ be to move one internal step?}
$$

For the logarithmic ruler, the answer is constant. For the linear ruler, the
absolute difference stays constant, so the relative difference shrinks as the
background grows. For a power ruler, the pattern depends on the exponent and on
where the scale was normalized.

The third panel turns the threshold into a two-alternative forced-choice curve.
The lab chooses the internal noise scale so that the selected Weber fraction
lands at the selected criterion. At the default setting:

```text
8% relative change -> 75% correct
```

This is not a claim about a particular sensory modality. It is a bookkeeping
choice that makes the slider's meaning explicit.

The fourth panel prints the Fechner ladder. Starting at intensity `1`, each
successive tick multiplies the stimulus by `1 + Weber fraction`. On the linear
axis the ticks spread out. On the log axis they line up evenly. That is the
geometry hiding inside the integral.

## A Scale Is Not a Sense Organ

The lab is intentionally small. Real psychophysical data are messier:
thresholds depend on adaptation, stimulus duration, attention, context,
response bias, lapse rates, and the chosen method of limits, adjustment, or
constant stimuli. Near zero intensity, logarithms need a reference floor.
Near saturation, every simple curve breaks.

The point is narrower. When someone says "people perceive this logarithmically"
or "perception follows a power law," ask which measurement problem they solved.

There are at least three different claims:

1. A discrimination claim: what increment is just noticeable?
2. A scale-building claim: how do threshold steps become distances?
3. A magnitude-judgment claim: what numbers do observers assign to sensations?

Weber, Fechner, and Stevens are often taught as a timeline of laws. I find them
more useful as a warning about units. The physical ruler and the perceptual
ruler need not share a zero, a unit, or even the same geometry.

If the just-noticeable unit is proportional to the background, the ruler is a
ratio. If the protocol changes, the ruler may change with it.

[^weber]: Ernst Heinrich Weber, [*De Pulsu, Resorptione, Auditu, et Tactu. Annotationes Anatomicae et Physiologicae*](https://books.google.com/books/about/De_Pulsu_resorptione_auditu_et_tactu.html?id=bdI-AAAAYAAJ), C. F. Koehler, 1834. A bibliographic record is also available through the [Sound & Science companion](https://soundandscience.net/texts/de-pulsu-resorptione-auditu-et-tactu-annotationes-anatomicae-et-physiologicae/).

[^fechner]: Gustav Theodor Fechner, [*Elemente der Psychophysik*](https://archive.org/details/elementederpsych001fech), Breitkopf und Haertel, 1860. See also the [HathiTrust catalog record](https://catalog.hathitrust.org/Record/000662889).

[^stevens]: S. S. Stevens, ["On the Psychophysical Law"](https://pubmed.ncbi.nlm.nih.gov/13441853/), *Psychological Review* 64(3):153-181, 1957. DOI: [10.1037/h0046162](https://doi.org/10.1037/h0046162).
