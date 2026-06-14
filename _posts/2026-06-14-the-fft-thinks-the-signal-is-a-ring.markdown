---
layout: post
title: "The FFT Thinks the Signal Is a Ring"
description: "FFT convolution is fast because multiplication in frequency space implements convolution. The catch is that the DFT lives on a circle, so missing zero padding turns tails into aliases."
date: 2026-06-14 05:24:00 -0400
categories: computer-science
tags: [fft, fourier-transform, convolution, signal-processing, numerical-computing, aliasing]
excerpt: "The convolution theorem is not enough. A finite DFT does not see a line of samples; it sees one period of a repeating signal. If the output does not fit, the tail wraps around."
---

The fast Fourier transform has the aura of a magic door.

Walk through it, multiply two spectra, walk back, and convolution becomes fast.
That sentence is true often enough to be dangerous.

The missing clause is:

```text
the DFT thinks your finite signal is one lap around a ring
```

If the convolution result fits inside that lap, everything is fine. If it does
not, the tail does not fall off the edge. It wraps around and adds itself to the
beginning.

This is not a bug in the FFT.

It is the geometry you asked for.

## The Linear Story

For two finite sequences \(x[n]\) and \(h[n]\), linear convolution is

$$
y[n] = \sum_m x[m]h[n-m].
$$

If \(x\) has length \(L\) and \(h\) has length \(M\), then \(y\) has length

$$
L + M - 1.
$$

That extra \(M-1\) is the tail. It is where the last nonzero samples of the
signal still overlap the filter.

In the time domain, the direct algorithm is almost embarrassingly literal:

```text
for each signal sample
  add a shifted copy of the filter
```

It costs \(O(LM)\). That is fine for small filters. It is painful for long
filters, large images, long audio, and repeated convolutions inside numerical
pipelines.

The Fourier-domain story says: convolution in time becomes multiplication in
frequency. MIT lecture notes state the continuous version in the familiar form:
the Fourier transform of a convolution is a product.[^mit] The discrete version
is what makes FFT convolution useful in code.

## The Fast Door

The DFT of \(N\) samples can be computed directly in \(O(N^2)\). Cooley and
Tukey's 1965 paper gave the classic fast algorithm for composite lengths,
factoring the calculation into sparse stages and reducing the work to
proportional to \(N\log N\) rather than \(N^2\).[^cooley]

So the tempting recipe is:

```text
FFT(x)
FFT(h)
multiply pointwise
inverse FFT
```

That recipe is incomplete.

The \(N\)-point DFT does not represent an isolated length-\(N\) vector. It
represents one period of an \(N\)-periodic signal. The DSP Guide puts this
plainly: the DFT views the time domain as a periodic signal with \(N\) samples
per period.[^dspguide]

Therefore multiplication of two \(N\)-point DFTs gives \(N\)-point circular
convolution:

$$
y_N[n]
=
\sum_{m=0}^{N-1} x_N[m]h_N[(n-m)\bmod N].
$$

The modulo is the ring.

Linear convolution becomes circular convolution when you identify sample \(N\)
with sample \(0\). If the true linear result has nonzero samples beyond
\(N-1\), those samples fold back.

## Zero Padding Is a Boundary Condition

To get linear convolution from DFT multiplication, pad both inputs with enough
zeros that the linear output fits into one period:

$$
N \ge L + M - 1.
$$

Then the circular convolution has nowhere to wrap. MathWorks states the same
rule for linear and circular convolution: for vectors of lengths \(P\) and
\(Q\), pad to length at least \(P+Q-1\), then keep the first \(P+Q-1\)
samples.[^mathworks]
University of Illinois lecture notes give the equivalent condition
\(N \ge L + M - 1\).[^illinois]

That is the whole contract.

```text
short FFT length: fast ring convolution
long enough FFT length: linear convolution via a ring large enough not to wrap
```

Zero padding is not decoration. It is the boundary condition that tells the DFT
how much silence exists after your finite signal.

## A Ring-Convolution Lab

The lab below builds a finite signal, a finite smoothing kernel, and compares:

1. direct linear convolution,
2. FFT convolution on the selected ring length,
3. properly padded FFT convolution.

The default is intentionally under-padded: a length-64 FFT tries to hold a
length-96 convolution. The tail wraps into the beginning. Increase **FFT ring
length** to 128 and the aliasing vanishes.

<style>
  .fft-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .fft-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .fft-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .fft-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .fft-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .fft-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .fft-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.25rem;
    padding: 0.62rem 0.7rem;
  }

  .fft-lab__metric span,
  .fft-lab__legend,
  .fft-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .fft-lab__metric span {
    display: block;
  }

  .fft-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .fft-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .fft-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .fft-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .fft-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .fft-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="fft-lab" data-fft-ring-lab>
  <div class="fft-lab__controls">
    <label>
      Signal length: <output data-value="signalLength">64</output>
      <input type="range" min="32" max="128" step="16" value="64" data-param="signalLength">
    </label>
    <label>
      Kernel length: <output data-value="kernelLength">33</output>
      <input type="range" min="5" max="65" step="4" value="33" data-param="kernelLength">
    </label>
    <label>
      FFT ring length: <output data-value="fftPower">64</output>
      <input type="range" min="5" max="9" step="1" value="6" data-param="fftPower">
    </label>
    <label>
      Tone mixture: <output data-value="tone">32%</output>
      <input type="range" min="0" max="100" step="1" value="32" data-param="tone">
    </label>
    <label>
      Seed: <output data-value="seed">21</output>
      <input type="range" min="1" max="99" step="1" value="21" data-param="seed">
    </label>
  </div>
  <div class="fft-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="FFT convolution lab comparing linear convolution, circular convolution, wrapped aliasing, spectra, and work estimates"></canvas>
  <div class="fft-lab__legend">
    <span><i style="background:#0f766e"></i> Linear convolution</span>
    <span><i style="background:#be123c"></i> FFT ring output</span>
    <span><i style="background:#b45309"></i> Wrapped tail</span>
    <span><i style="background:#2563eb"></i> Signal spectrum</span>
  </div>
  <p class="fft-lab__note">
    Deterministic toy experiment. The FFT implementation is a plain radix-2
    Cooley-Tukey transform written for the article. The operation bars are a
    rough model, not a benchmark of browser performance or optimized libraries.
  </p>
</div>
<script defer src="{{ '/assets/js/fft-ring-lab.js?v=20260614b' | relative_url }}"></script>

The first useful move is boring: raise **FFT ring length** to 128. The required
length remains 96, but the ring is now large enough. The alias metrics drop to
zero and the padded FFT error is down at floating-point noise.

Now increase **Kernel length**. The tail grows. If the ring length does not grow
with it, more of the linear output has to fold back into the first samples.

Finally change **Tone mixture**. The spectrum panel changes, but the padding
rule does not. Frequency content affects how the convolution looks; support
length determines whether the finite DFT has enough room.

## The Border Is a Modeling Choice

The ring is not always wrong.

If your domain is naturally periodic, circular convolution may be exactly the
model you want. Texture synthesis, phase vocoders, spectral methods on periodic
domains, and some simulation grids deliberately use wraparound boundaries.

If your domain is not periodic, circular convolution is a boundary artifact.
Images blur across the left and right edges. Audio tails wrap to the beginning.
Finite signals acquire ghosts from their own future.

Zero padding says:

```text
outside the observed support, pretend the signal is zero
```

Reflection padding says something else. Replication padding says something
else. Periodic padding says something else. Every boundary condition is a
modeling choice wearing an implementation costume.

## When the FFT Is Actually Worth It

FFT convolution has overhead. You transform both inputs, multiply complex
spectra, then inverse transform. For small filters, direct convolution can be
faster because it is simple, cache-friendly, and has tiny constants. For long
filters or large batches, the \(N\log N\) scaling wins.

Production systems also avoid doing one giant transform when streaming. They
use overlap-add or overlap-save: split the signal into blocks, FFT each block
with padding, multiply by the filter spectrum, then stitch together the valid
regions. The same ring rule is still present. The block algorithm merely manages
where the wrapped samples are allowed to go.

This is why FFT convolution belongs in a systems notebook, not only a signal
processing textbook. The math gives an identity. The implementation has to
choose:

- the transform length,
- the padding rule,
- the block size,
- the boundary condition,
- the point where direct convolution beats FFT overhead.

The speedup is real. The boundary is part of the API.

## The Door Opens onto a Circle

The convolution theorem is beautiful because it turns a global sliding sum into
local multiplication in a different basis.

But the finite DFT basis is periodic. It tiles the world. That is why the FFT can
be both astonishingly fast and quietly wrong at the edges.

The safe sentence is:

```text
FFT multiplication computes circular convolution.
Zero padding makes that circle large enough to contain the line.
```

Once you remember the ring, the magic door becomes an engineering tool again.

## Notes

[^mit]: MIT OpenCourseWare, "Introduction to Neural Computation," Lecture 12, includes the convolution theorem: convolution in time corresponds to multiplication in frequency. [PDF](https://ocw.mit.edu/courses/9-40-introduction-to-neural-computation-spring-2018/3af4f6a0ae1df1d886293979018142b0_MIT9_40S18_Lec12.pdf).

[^cooley]: James W. Cooley and John W. Tukey, "An Algorithm for the Machine Calculation of Complex Fourier Series," *Mathematics of Computation*, 1965. [PDF](https://web.stanford.edu/class/cme324/classics/cooley-tukey.pdf), [Semantic Scholar](https://www.semanticscholar.org/paper/An-algorithm-for-the-machine-calculation-of-complex-Cooley-Tukey/0e6beb95b5150ce99b108acdefabf70ccd3fee30).

[^dspguide]: Steven W. Smith, *The Scientist and Engineer's Guide to Digital Signal Processing*, Chapter 9, "Convolution via the Frequency Domain." [Online chapter](https://www.dspguide.com/ch9/3.htm), [chapter PDF](https://www.dspguide.com/CH9.PDF).

[^mathworks]: MathWorks, "Linear and Circular Convolution." [Documentation](https://www.mathworks.com/help/signal/ug/linear-and-circular-convolution.html).

[^illinois]: University of Illinois ECE 401, "Lecture 24: Circular Convolution," notes on zero-padding circular convolution to obtain linear convolution. [PDF](https://courses.grainger.illinois.edu/ECE401/fa2022/lectures/lec24.pdf).
