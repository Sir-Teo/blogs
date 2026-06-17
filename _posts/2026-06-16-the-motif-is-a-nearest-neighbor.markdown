---
layout: post
title: "The Motif Is a Nearest Neighbor"
description: "Matrix profiles turn time-series motif discovery into a nearest-neighbor ledger over sliding windows. The smallest entry finds repeated shape; the largest entry points at isolation."
date: 2026-06-16 20:58:00 -0400
categories: statistics
tags: [matrix-profile, time-series, motif-discovery, anomaly-detection, nearest-neighbors, data-mining, statistics]
excerpt: "A matrix profile asks every sliding window in a time series for its nearest nontrivial neighbor. The lowest answers are motifs. The highest answers are discords."
---

A long time series looks continuous until you ask the wrong question.

```text
where does this whole behavior happen again?
```

Not the same value. Not the same timestamp. The same little story: the same
valve cycle, tremor, gait, packet burst, machine sound, liquidity pattern, or
ECG beat, possibly shifted upward, scaled down, and buried under drift.

Pointwise plots are bad at this. They make you stare at the line and hope your
eyes perform a nearest-neighbor search.

The matrix profile makes the question explicit.

Take a window of length $$m$$. Slide it across the series. For every start
position $$i$$, compare the subsequence

$$
T_{i,m} = (t_i,\ldots,t_{i+m-1})
$$

to every other subsequence far enough away that it is not just the same window
overlapping itself. Store only one number:

$$
P_i = \min_{|i-j| > e} d(T_{i,m}, T_{j,m}).
$$

That vector $$P$$ is the matrix profile.

Small entries mean:

```text
this shape has a close nontrivial neighbor
```

Large entries mean:

```text
even the nearest neighbor is far away
```

The first kind is a motif. The second kind is a discord.

The strange elegance is that both come from the same ledger.

## The Ledger

The lab below computes the matrix profile by brute force so the object stays
visible. It generates a synthetic sensor trace, inserts repeated shapes at
different levels and scales, adds one isolated event, and asks every sliding
window for its nearest nontrivial neighbor.

The production algorithms are much faster. MASS computes distance profiles
using FFT-based convolution.[^mass] STAMP and STOMP organize those distance
profiles into scalable matrix-profile algorithms.[^mp-page] But the browser lab
keeps the slow all-pairs version because it is small enough to inspect.

The useful thing to break is the distance definition.

Switch **Distance** from `z-normalized` to `raw Euclidean`. The repeated motif
is still in the signal, but raw distance now cares about level and amplitude.
It can prefer two boring low-variance windows over two copies of the same
shape.

<style>
  .mp-lab {
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

  .mp-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    margin-bottom: 1rem;
  }

  .mp-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .mp-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .mp-lab input,
  .mp-lab select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .mp-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .mp-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .mp-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .mp-lab__metric span,
  .mp-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .mp-lab__metric span {
    display: block;
  }

  .mp-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .mp-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .mp-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="matrix-profile-lab" class="mp-lab" data-matrix-profile-lab>
  <div class="mp-lab__controls">
    <label>
      Scenario
      <select data-param="scenario">
        <option value="valve" selected>scaled valve cycle</option>
        <option value="drift">motifs under drift</option>
        <option value="pulse">bursty sensor</option>
      </select>
    </label>
    <label>
      Distance
      <select data-param="mode">
        <option value="znorm" selected>z-normalized</option>
        <option value="raw">raw Euclidean</option>
      </select>
    </label>
    <label>
      Window: <output data-value="window">44</output>
      <input type="range" min="24" max="76" step="1" value="44" data-param="window">
    </label>
    <label>
      Noise: <output data-value="noise">14%</output>
      <input type="range" min="0" max="35" step="1" value="14" data-param="noise">
    </label>
    <label>
      Scale/offset gap: <output data-value="contrast">45%</output>
      <input type="range" min="0" max="80" step="1" value="45" data-param="contrast">
    </label>
    <label>
      Seed: <output data-value="seed">41</output>
      <input type="range" min="1" max="997" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="mp-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="Matrix profile lab showing a time series, matrix profile, motif pair, discord, distance profile, and all-pairs distance sketch"></canvas>
  <p class="mp-lab__note">
    Deterministic browser experiment. The implementation computes the full
    all-pairs subsequence distance matrix for a short synthetic series; MASS,
    STAMP, STOMP, and GPU variants are the scalable versions of this idea.
  </p>
</div>
<script defer src="{{ '/assets/js/matrix-profile-lab.js?v=20260616a' | relative_url }}"></script>

In the default run, the normalized profile finds the planted shape pair. The
nearest-neighbor distance at the best motif is about `0.355`; the most isolated
window has a nearest-neighbor distance about `1.156`, or roughly `3.3x` larger.

Raw Euclidean distance fails this calibration example on purpose. It is not
wrong in the abstract. It answers a different question:

```text
which windows have similar values, levels, and scales?
```

Z-normalized distance answers:

```text
which windows have similar shape after local mean and variance are removed?
```

Those are not interchangeable.

## Why The Diagonal Is Forbidden

If the window beginning at time $$i$$ is allowed to compare with the window
beginning at $$i+1$$, it will usually find an excellent match. Of course it
will. The two windows share almost all their points.

That is a trivial match, not a motif.

Matrix-profile self-joins therefore use an exclusion zone around the diagonal
of the all-pairs distance matrix. In the lab, the gray band in the distance
profile is the forbidden neighborhood. The exact width is a modeling choice,
but the principle is not optional: the nearest neighbor has to be far enough
away to count as another occurrence.

This is the first place where the phrase "unsupervised" can mislead. The
algorithm does not need labels, but it still needs contracts:

- a window length;
- a distance measure;
- an exclusion zone;
- a policy for missing values and flat windows;
- a decision about whether level and scale matter.

The matrix profile gives you a powerful primitive. It does not remove the
measurement problem.

## Motifs And Discords Share One Object

The STUMPY documentation gives the clean definition: a matrix profile stores
the z-normalized Euclidean distance from each subsequence to its nearest
neighbor.[^stumpy] Once you have that vector, two common queries become almost
embarrassingly simple:

$$
\text{motif start} = \arg\min_i P_i
$$

and

$$
\text{discord start} = \arg\max_i P_i.
$$

The minimum is a repeated behavior. The maximum is a behavior whose nearest
neighbor is still far away.

That is why the matrix profile became a unifying object. Yeh, Zhu, Ulanova,
Begum, Ding, Dau, Silva, Mueen, and Keogh framed it as an all-pairs
subsequence similarity join that yields motifs and discords as side effects,
and extends to several other time-series mining tasks.[^mp1] Later STOMP and
GPU-STOMP work pushed the same object toward much larger joins.[^stomp]

The conceptual compression matters as much as the computational speed:

```text
do the expensive neighbor accounting once, then ask different questions of the
same profile
```

That is a good design pattern in data analysis. Make a reusable intermediate
object whose semantics are narrow enough to audit.

## Window Length Is The Hypothesis

The lab's **Window** control is where the scientific claim hides.

Too short, and the algorithm finds tiny fragments: one edge of a pulse, one
shoulder of a cycle, one coincidental wiggle. Too long, and it mixes the motif
with unrelated context. The repeated shape is still there, but the window has
asked for a larger story than the data can repeat.

This is not a nuisance parameter. The window length is the duration of the
behavior you believe is meaningful.

For a heartbeat, it might be one beat. For an industrial cycle, it might be one
valve opening and closing. For trading data, it might be a quote-replenishment
episode or an execution response, not a calendar minute by default.

The matrix profile is exact only after the question has been specified.

## Shape Is Not Always Enough

Z-normalization is the default in much of matrix-profile work because it makes
motif discovery robust to local offset and scale. That is exactly why the lab's
default succeeds: the same shape appears at different levels.

But sometimes the level is the event.

If a pressure waveform at 10 psi and the same waveform at 200 psi mean
different operating regimes, normalizing them into the same shape may be the
wrong move. If a volatility pattern matters because the amplitude exploded,
variance normalization may hide the point.

Raw distance is not a beginner mistake. It is a different sensor.

The responsible report says which invariances were purchased:

```text
translation invariance
scale invariance
time-warp invariance
missing-data policy
multivariate aggregation
```

Matrix profiles give an unusually visible place to write these choices down.

## The Brute Force Version Is A Diagram

The browser implementation is intentionally plain:

```text
for each subsequence i:
  for each subsequence j outside the exclusion zone:
    compute distance(i, j)
    keep the nearest neighbor for i and j
```

That is not how you should mine a million-point sensor stream. The naive
all-pairs search is quadratic in the number of subsequences. Exact motif
discovery has a long history of pruning, lower bounds, early abandoning, FFT
distance profiles, anytime algorithms, ordered search, and GPU kernels.
Mueen, Keogh, Zhu, Cash, and Westover's exact motif work was already about
making the exact search tractable rather than pretending the quadratic search
was fine.[^exact-motif]

But the slow loop is the right diagram.

It shows the distance matrix. It shows the forbidden diagonal. It shows that
the matrix profile is not a classifier, not a forecast, and not a magic anomaly
score. It is a nearest-neighbor receipt for every window.

## What I Would Audit In Production

I would not ship a motif detector with only a pretty plot.

I would want:

- window-length sensitivity;
- normalized and raw-distance comparisons;
- known-event overlays where labels exist;
- nearest-neighbor pairs, not just profile values;
- the exclusion-zone policy;
- stability across sampling rate changes;
- treatment of flat windows and missing spans;
- a manual review queue for the top motifs and top discords;
- negative controls where the series has been shuffled or phase-randomized.

The negative control is especially useful. If the profile still finds a
beautiful motif after the temporal structure has been destroyed, the detector
may be finding marginal distribution artifacts rather than repeated behavior.

## The Line Was Never Just A Line

A time series is often drawn as one curve. Matrix profiles insist that it is
also a collection of overlapping examples.

Every window asks:

```text
who is my nearest nontrivial neighbor?
```

The smallest answer points to repetition. The largest answer points to
isolation. Both answers depend on the window, the distance, and the invariance
story you chose.

That is the real gift of the matrix profile. It turns visual recognition into a
ledger that can be audited.

## Paper Trail

[^exact-motif]: Abdullah Mueen, Eamonn Keogh, Qiang Zhu, Sydney Cash, and Brandon Westover, ["Exact Discovery of Time Series Motifs"](https://epubs.siam.org/doi/10.1137/1.9781611972795.41), *SIAM International Conference on Data Mining*, 2009. Author PDF: [UCR](https://www.cs.ucr.edu/~mueen/pdf/EM.pdf).

[^mass]: Abdullah Mueen et al., ["The Fastest Similarity Search Algorithm for Time Series Subsequences under Euclidean Distance"](https://www.cs.unm.edu/~mueen/FastestSimilaritySearch.html), MASS project page. The page describes MASS as an algorithm for computing a distance profile for a query subsequence.

[^mp-page]: Eamonn Keogh's [UCR Matrix Profile page](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html) lists the Matrix Profile I and II papers and the broader series of matrix-profile work.

[^stumpy]: STUMPY documentation, ["The Matrix Profile"](https://stumpy.readthedocs.io/en/latest/Tutorial_The_Matrix_Profile.html), describes the profile as a vector of nearest-neighbor distances between subsequences under z-normalized Euclidean distance.

[^mp1]: Chin-Chia Michael Yeh, Yan Zhu, Liudmila Ulanova, Nurjahan Begum, Yifei Ding, Hoang Anh Dau, Diego Furtado Silva, Abdullah Mueen, and Eamonn Keogh, ["Matrix Profile I: All Pairs Similarity Joins for Time Series"](https://www.cs.ucr.edu/~eamonn/PID4481997_extend_Matrix%20Profile_I.pdf), *IEEE ICDM*, 2016.

[^stomp]: Yan Zhu, Zachary Zimmerman, Nader Shakibay Senobari, Chin-Chia Michael Yeh, Gareth Funning, Abdullah Mueen, Philip Brisk, and Eamonn Keogh, ["Matrix Profile II / STOMP and GPU-STOMP"](https://www.cs.ucr.edu/~eamonn/ten_quadrillion.pdf), *IEEE ICDM* and journal expansion.
