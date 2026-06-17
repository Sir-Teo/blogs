---
layout: post
title: "The Bin Is a Filter"
description: "A DFT bin is not a tiny bucket that catches one exact frequency. It is a window-shaped filter, and spectral leakage is what happens when the tone falls between the filters."
date: 2026-06-17 00:34:00 -0400
categories: mathematics
tags: [dft, fft, spectral-leakage, window-functions, signal-processing, numerical-computing, spectrum-estimation]
excerpt: "Zero padding does not add information, and windows do not delete leakage. They change how each DFT bin listens."
---

A spectrum plot looks like a row of buckets.

Each bar has a frequency label. A signal goes in. Energy lands in the right
bucket. The tallest bucket wins.

That picture is convenient and usually wrong.

A DFT bin is not a bucket. It is a test:

```text
how much does this finite record look like this finite sinusoid?
```

More precisely, each bin is an inner product against one complex exponential on
the observation interval. If the signal completes an integer number of cycles
inside that interval, one bin can answer cleanly. If it does not, the record
looks like a tone with a seam. The seam has to be explained by many finite
sinusoids.

That is spectral leakage.

## The Record Has Edges

The continuous Fourier transform tempts us to think in infinite signals. A
recording, a packet of sensor data, a profiling trace, or a block of audio is
not infinite. It is a finite rectangle cut out of time.

Harris's classic window survey starts from that operational fact: every
observed signal we actually process has finite extent, and the DFT gives
uniformly spaced samples of the associated periodic spectra.[^harris] The
periodic part matters. The DFT treats your length-\(N\) vector as one lap of a
repeating signal.

Suppose the record is

$$
x[n] = \cos\left(2\pi \frac{(k+\delta)n}{N} + \phi\right),
$$

where \(0 < \delta < 1\). The tone is between bins. When the record repeats,
the last sample does not meet the first sample smoothly. The DFT can represent
that repeated object exactly, but it needs energy across many bins to do it.

The leakage is not caused by the FFT algorithm. Cooley and Tukey made the
calculation fast in 1965 by factoring the Fourier calculation into sparse
stages.[^cooley] They did not change what the finite transform measures.

Fast buckets are still not buckets.

## The Window Is The Shape Of Listening

Before taking the DFT, we can multiply the record by a window \(w[n]\):

$$
X_w[k] = \sum_{n=0}^{N-1} x[n]w[n]e^{-i2\pi kn/N}.
$$

That multiplication changes the filter each bin uses.

For a pure complex tone at frequency \(k+\delta\), the response of bin \(k\) is
basically the Fourier transform of the window at offset \(\delta\). A
rectangular window listens sharply in the middle but has high sidelobes. A Hann
window listens more broadly but pushes far-away sidelobes down. A flat-top
window spends even more bandwidth to make amplitude less sensitive to landing
between bins.

Harris frames this as a detection and estimation tradeoff. Windows affect nearby
strong-tone interference, resolvability, amplitude bias, and broadband noise
collection. In his language, the window behaves like a filter and has an
equivalent noise bandwidth.[^harris] Heinzel, Ruediger, and Schilling's
practical DFT guide emphasizes the same engineering burden: power spectra and
power spectral densities differ by scaling details, with ENBW as one of the
important bookkeeping terms.[^heinzel]

So the question is not:

```text
which window removes leakage?
```

It is:

```text
where do I want the leakage to go, and which bill can I afford?
```

## The Lab

The default experiment uses:

```text
64 samples
strong tone at bin 11.37
weak tone 3.4 bins higher
weak tone amplitude = -38 dB
Hann window
4x zero padding
```

The lab computes the DFT directly, not with an FFT, because the point is to make
the bin inner products visible. The plotted spectrum includes the ordinary
integer bins and the denser zero-padded samples.

<style>
  .dft-lab {
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

  .dft-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .dft-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .dft-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .dft-lab input,
  .dft-lab select {
    font: inherit;
    min-height: 2rem;
    width: 100%;
  }

  .dft-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.2rem 0.45rem;
  }

  .dft-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .dft-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .dft-lab__metric.good {
    border-color: #9ed8c5;
  }

  .dft-lab__metric.bad {
    border-color: #f0b7b7;
  }

  .dft-lab__metric.warn {
    border-color: #ffd59b;
  }

  .dft-lab__metric span,
  .dft-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .dft-lab__metric span {
    display: block;
  }

  .dft-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .dft-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .dft-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .dft-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .dft-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .dft-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .dft-lab {
      padding: 0.75rem;
    }

    .dft-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="dft-window-lab" class="dft-lab" data-dft-window-lab>
  <div class="dft-lab__controls">
    <label>
      Window: <output data-value="window">Hann</output>
      <select data-param="window">
        <option value="rectangular">rectangular</option>
        <option value="hann" selected>Hann</option>
        <option value="hamming">Hamming</option>
        <option value="blackmanHarris">Blackman-Harris</option>
        <option value="flatTop">flat top</option>
      </select>
    </label>
    <label>
      Record length: <output data-value="bins">64</output>
      <input type="range" min="32" max="256" step="32" value="64" data-param="bins">
    </label>
    <label>
      Tone offset: <output data-value="offset">0.37</output>
      <input type="range" min="0" max="0.5" step="0.01" value="0.37" data-param="offset">
    </label>
    <label>
      Zero padding: <output data-value="padding">4x</output>
      <input type="range" min="1" max="8" step="1" value="4" data-param="padding">
    </label>
    <label>
      Weak-tone gap: <output data-value="separation">3.4</output>
      <input type="range" min="1.1" max="7.8" step="0.1" value="3.4" data-param="separation">
    </label>
    <label>
      Weak-tone level: <output data-value="weakDb">-38 dB</output>
      <input type="range" min="-60" max="-12" step="1" value="-38" data-param="weakDb">
    </label>
  </div>
  <div class="dft-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="DFT window lab showing finite record seams, spectrum samples, window response, and leakage tradeoffs"></canvas>
  <div class="dft-lab__legend">
    <span><i style="background:#2563eb"></i> integer-bin samples</span>
    <span><i style="background:#0891b2"></i> zero-padded samples</span>
    <span><i style="background:#be123c"></i> strong tone</span>
    <span><i style="background:#d97706"></i> weak tone</span>
    <span><i style="background:#7c3aed"></i> bin response</span>
  </div>
  <p class="dft-lab__note">
    Deterministic direct-DFT experiment. The Node audit runs 21,195 checks:
    window sums, coherent gain, ENBW, response symmetry, half-bin scalloping,
    integer-bin replay under zero padding, weak-tone masking, and control
    sanitization.
  </p>
</div>
<script defer src="{{ '/assets/js/dft-window-lab.js?v=20260617b' | relative_url }}"></script>

Try five moves.

First, set **Window** to `rectangular`. The seam in the time panel stays large.
The strong off-bin tone throws a tall sidelobe floor into the weak tone's
neighborhood. The weak tone is present in the generated signal, but the strong
tone's leakage is louder than the thing you are trying to see.

Second, switch back to `Hann`. The weak tone clears the leakage floor. That did
not happen because the Hann window has more resolution. It happened because the
sidelobes moved down.

Third, switch to `flat top`. The nearest-bin amplitude becomes almost immune to
half-bin placement. But the weak tone can become harder to see because the main
lobe is wide and the equivalent noise bandwidth is large. The flat-top window
is an amplitude meter, not a free microscope.

Fourth, raise **Zero padding**. The peak marker gets closer to the actual
off-bin frequency. The lobe does not get narrower. Zero padding adds samples of
the same continuous-looking window response; it does not add a longer
observation.

Fifth, raise **Record length**. Now the same bin offset corresponds to a longer
time record. The main lobe tightens in frequency units. This is the real
resolution purchase: observe for longer.

## Scalloping Is A Gauge Error

If a tone lands exactly at a bin center, the coherent-gain-corrected peak can
recover its amplitude cleanly. If the tone lands halfway between two bins, the
nearest bin does not hear it at full strength.

That loss is called scalloping loss. In the lab audit, a rectangular window at a
half-bin offset loses about `3.92 dB`. A Hann window loses about `1.42 dB`.
The flat-top window is designed to make that loss nearly vanish.

This is not a contradiction with leakage. It is a different measurement goal.

```text
low sidelobes:        protect weak neighbors from strong-tone leakage
low scalloping loss:  keep tone amplitude stable between bin centers
low ENBW:             collect less broadband noise per bin
narrow main lobe:     separate nearby tones
```

No single window wins all four contests.

## Zero Padding Is Interpolation, Not Evidence

Zero padding is useful. It gives a denser frequency grid, so the sampled peak can
sit closer to the true off-bin tone. It makes plots easier to read and simple
frequency estimators less jagged.

But it does not create new samples of the original process. The actual record is
still \(N\) observations. If two tones are too close for that observation length
and window, padding will draw a smoother blur.

Welch's spectral-estimation paper is a useful reminder of the larger workflow:
practical spectra often section a record, window each section, compute
periodograms, and average them to trade variance against time resolution.[^welch]
That whole procedure is not "FFT and believe the bar." It is measurement design.

## The Checklist I Want Before Trusting A Peak

When a spectral peak becomes a product decision, a science claim, or a trading
signal, I want the boring receipt:

```text
sample rate
record length
window
coherent gain correction
ENBW
zero-padding factor
peak interpolation rule
nearby strong tones
noise floor estimate
whether the question is detection, amplitude, or resolution
```

Those fields look fussy until a weak line disappears under a sidelobe, or a
flat-top amplitude plot convinces someone that two close tones are one object.

The DFT did not lie.

The bin listened with the filter you handed it.

[^harris]: Fredric J. Harris, ["On the Use of Windows for Harmonic Analysis with the Discrete Fourier Transform"](https://www.cs.cmu.edu/afs/cs/user/bhiksha/WWW/courses/dsp/spring2013/WWW/schedule/readings/windows_comparison2_harris.pdf), *Proceedings of the IEEE* 66(1):51-83, 1978. DOI: [10.1109/PROC.1978.10837](https://doi.org/10.1109/PROC.1978.10837).

[^cooley]: James W. Cooley and John W. Tukey, ["An Algorithm for the Machine Calculation of Complex Fourier Series"](https://web.stanford.edu/class/cme324/classics/cooley-tukey.pdf), *Mathematics of Computation* 19(90):297-301, 1965. DOI: [10.1090/S0025-5718-1965-0178586-1](https://doi.org/10.1090/S0025-5718-1965-0178586-1).

[^heinzel]: Gerhard Heinzel, Albrecht Ruediger, and Roland Schilling, ["Spectrum and spectral density estimation by the Discrete Fourier transform (DFT), including a comprehensive list of window functions and some new flat-top windows"](https://holometer.fnal.gov/GH_FFT.pdf), Max-Planck-Institut fur Gravitationsphysik technical report, 2002.

[^welch]: Peter D. Welch, ["The Use of Fast Fourier Transform for the Estimation of Power Spectra: A Method Based on Time Averaging Over Short, Modified Periodograms"](https://www.semanticscholar.org/paper/The-use-of-fast-Fourier-transform-for-the-of-power-Welch/e63345b4243e2376720a4e66373fdffe7a7d6be0), *IEEE Transactions on Audio and Electroacoustics* 15(2):70-73, 1967.
