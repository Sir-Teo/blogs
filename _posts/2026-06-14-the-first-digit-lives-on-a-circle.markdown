---
layout: post
title: "The First Digit Lives on a Circle"
description: "Benford's law is not a numerology trick about 1s. It is a statement about logarithmic mantissas, scale invariance, and when a dataset has no preferred unit."
date: 2026-06-14 19:10:00 -0400
categories: statistics
tags: [benfords-law, scale-invariance, fraud-detection, forensic-analytics, probability, data-quality]
excerpt: "A first-digit test is really a scale test. If the fractional part of log10(x) is spread evenly around the unit circle, the digits fall out automatically."
---

Benford's law is usually introduced as a party trick:

```text
In many real datasets, about 30% of numbers start with 1.
```

That is true, and also the least interesting way to say it.

The better version is geometric:

```text
look at log10(x), throw away the integer part, and ask whether the remainder is
uniform on the unit interval
```

The first digit lives on that circle.

If the fractional part of \(\log_{10} x\) is uniform on \([0,1)\), then the
probability of first digit \(d\) is the length of the interval

$$
[\log_{10} d,\log_{10}(d+1)).
$$

So

$$
\Pr(D=d)=\log_{10}(d+1)-\log_{10}(d)
=\log_{10}\left(1+\frac{1}{d}\right).
$$

That formula says digit `1` gets the interval from \(1\) to \(2\), digit `2`
gets \(2\) to \(3\), and digit `9` gets only \(9\) to \(10\), all measured on a
log scale. The low digits are not lucky. Their logarithmic intervals are wider.

## The Dirty Log Tables Were a Clue

Simon Newcomb noticed the phenomenon in 1881 by looking at logarithm tables. The
early pages were more worn than the later pages, suggesting that numbers
beginning with small leading digits were looked up more often.[^newcomb]

Frank Benford returned to the observation in 1938 and collected about twenty
thousand first digits from heterogeneous sources: physical constants, areas,
populations, drainage rates, addresses, and other tables.[^benford] The name
stuck to Benford, but the clue was already in Newcomb's dirty pages.

The clue matters because logarithm tables are organized by mantissa. When you
look up a number in a common-log table, the decimal point has already been
removed. `123`, `12.3`, and `0.00123` live in the same neighborhood because they
share the same significant digits.

That is why Benford's law is not primarily about base-10 notation. It is about
not having a privileged scale.

Multiply every value by `3.7`. A genuinely Benford dataset should still look
Benford. The decimal points move. The units change. The fractional log positions
only rotate around the circle.

Hill's 1995 theorem makes this intuition precise from an invariance direction:
assuming base-invariance of the underlying law leads to the Benford
distribution; the core objects are mantissas and invariant measures on a
circle.[^hill]

## A Scale Lab

The lab below generates synthetic datasets under four contracts:

- **scale mixture**: sizes drawn across several orders of magnitude;
- **growth path**: multiplicative growth observed over time;
- **linear range**: values uniformly sampled from a bounded linear interval;
- **ID window**: serial-like values with a fixed prefix.

Then it measures three things:

- first-digit mean absolute deviation from Benford;
- Kolmogorov-Smirnov distance of log mantissas from uniform;
- scale drift after multiplying every value by constants like `2`, `5`, and
  `7`.

The default scale mixture has first-digit MAD about `0.30%`, mantissa KS about
`0.014`, and scale drift about `3.0%`. Switch to **linear range** and the digit
histogram becomes almost flat; the MAD jumps to about `6.24%` and scale drift to
about `53.3%`. Same sample size, different contract.

<style>
  .benford-lab {
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

  .benford-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(154px, 1fr));
  }

  .benford-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .benford-lab__controls input,
  .benford-lab__controls select {
    accent-color: #7c3aed;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .benford-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .benford-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .benford-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .benford-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .benford-lab__metric span,
  .benford-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .benford-lab__metric span {
    display: block;
  }

  .benford-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .benford-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .benford-lab__note {
    margin: 0.9rem 0 0;
  }

  @media (min-width: 900px) {
    .benford-lab {
      margin-left: calc((100% - min(92vw, 1040px)) / 2);
      max-width: none;
      width: min(92vw, 1040px);
    }
  }
</style>

<div class="benford-lab" data-benford-scale-lab>
  <div class="benford-lab__controls">
    <label>
      Generator
      <select data-param="mode">
        <option value="scale-mixture" selected>scale mixture</option>
        <option value="growth-path">growth path</option>
        <option value="linear-range">linear range</option>
        <option value="id-window">ID window</option>
      </select>
    </label>
    <label>
      Samples: <output data-value="samples">2400</output>
      <input type="range" min="300" max="6000" step="100" value="2400" data-param="samples">
    </label>
    <label>
      Decades: <output data-value="decades">5</output>
      <input type="range" min="1" max="8" step="1" value="5" data-param="decades">
    </label>
    <label>
      Roughness: <output data-value="roughness">55</output>
      <input type="range" min="0" max="100" step="5" value="55" data-param="roughness">
    </label>
    <label>
      Human thresholds: <output data-value="human">0%</output>
      <input type="range" min="0" max="45" step="5" value="0" data-param="human">
    </label>
    <label>
      Seed: <output data-value="seed">31</output>
      <input type="range" min="1" max="9999" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="benford-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Benford law simulator showing first digits, log mantissas, scale stress tests, and sample values on a logarithmic map"></canvas>
  <p class="benford-lab__note">
    Synthetic data only. Threshold contamination snaps some values near endings
    like 1.99, 4.99, and 9.99 within their current decade.
  </p>
</div>

<script src="{{ '/assets/js/benford-scale-lab.js?v=20260614a' | relative_url }}"></script>

## A First-Digit Test Is a Unit Test

The multiplier panel is the one I trust most.

If the data are genuinely scale-free in the first-digit sense, multiplying by a
constant should not change the diagnostic much. It is the same collection of
sizes expressed in a different unit. Meters to feet. Dollars to yen. Seconds to
milliseconds. The mantissas rotate, but a uniform circle stays uniform.

If the data are a linear range, a serial-number window, or a collection cut by
policy thresholds, the rotation changes the shape. That is what the lab calls
scale drift.

This is why "many orders of magnitude" is not the whole story. A linear uniform
range from `1` to `100000` spans five decades, but its first digits are almost
flat because the final decade contains most of the linear mass. Benford behavior
comes from log-scale spread, not from a large maximum printed in the column.

## Fraud Detection Is the Dangerous Use Case

Benford tests are popular in audit and forensic analytics because humans invent
numbers poorly, and operational rules leave digit-shaped scars. Nigrini-style
training material emphasizes exactly the right caveats: numbers should represent
sizes of facts or events, should not be identifiers, and should not be dominated
by built-in minimums or maximums.[^nigrini]

The lab's **human thresholds** slider is deliberately crude. It does not model a
real fraudster. It only shows how easy it is to produce non-Benford digits by
placing mass near psychologically or administratively meaningful endings:

```text
49, 99, 199, 499, 999, ...
```

At `25%` threshold contamination, the default scale mixture flips from
Benford-like to not Benford: the first-digit MAD is about `2.94%`, the mantissa
KS is about `0.105`, and scale drift is about `23.9%`.

That is a lead, not a conviction.

Miller and Nigrini's fraud-detection slides put the caution plainly: not all
fraud is detectable by Benford's law, and a mathematical anomaly is not proof of
fraud.[^miller-nigrini] The right interpretation is investigative:

```text
this subset does not look like the contract I claimed generated it
```

Then the work starts. Was there a reporting threshold? A tax bracket? A maximum
reimbursement? A minimum invoice size? A serial-number prefix? A unit conversion?
A product catalog? A seasonal campaign? A missing negative sign? A filter that
quietly removed small values?

Benford is useful when it makes you ask those questions earlier.

## The Contract I Want Written Down

Before running a Benford test on real data, I want the data owner to answer:

- Are these measurements of size, not labels, rankings, IDs, prices chosen from
  a catalog, or capped scores?
- Do the values cover enough log-scale range?
- Were zeros, negatives, refunds, censored values, or rounded values removed?
- Are there policy thresholds that create mass near `49`, `99`, or `999`?
- Is the tested subset natural, or was it selected after looking at the digits?
- What non-fraud process would create the same anomaly?

If those answers are fuzzy, the first-digit chart is decoration.

The strongest form of the test is not "the blue bars differ from the purple
dots." The strongest form is:

```text
the data-generating story predicts log mantissas should be close to uniform,
but this audited subset is not stable under changes of scale
```

That is a falsifiable sentence. It names a mechanism. It can be checked against
domain facts.

## The Useful Lesson

Benford's law has survived because it is both simple and slippery.

Simple:

$$
\Pr(D=d)=\log_{10}\left(1+\frac{1}{d}\right).
$$

Slippery because the formula is not a universal law of "real data." It is the
shadow cast by a stronger symmetry: no preferred unit, no privileged decade, no
hard range that pins the mantissa in place.

The first digit is a scale test.

When it passes, the dataset is behaving as if its logarithms are spread around a
circle. When it fails, the interesting question is not whether the number `1`
appeared too often. The interesting question is:

```text
what broke the circle?
```

[^newcomb]: Simon Newcomb, "Note on the Frequency of Use of the Different Digits in Natural Numbers", *American Journal of Mathematics* 4(1), 39-40, 1881. [PDF](https://pdodds.w3.uvm.edu/files/papers/others/1881/newcomb1881a.pdf).

[^benford]: Frank Benford, "The Law of Anomalous Numbers", *Proceedings of the American Philosophical Society* 78(4), 551-572, 1938. [PDF](https://pdodds.w3.uvm.edu/research/papers/others/1938/benford1938a.pdf).

[^hill]: Theodore P. Hill, "Base-Invariance Implies Benford's Law", *Proceedings of the American Mathematical Society* 123(3), 887-895, 1995. [Record and abstract](https://digitalcommons.calpoly.edu/rgp_rsr/30/).

[^nigrini]: Mark J. Nigrini, "Benford's Law research" training slides, 2012. The slides summarize practical conditions for digit tests, including that numbers should represent sizes and not identification numbers. [PDF](https://www.fraudconference.com/uploadedFiles/Fraud_Conference/Content/Course-Materials/presentations/23rd/ppt/12E-Mark-Nigrini.pdf).

[^miller-nigrini]: Steven J. Miller and Mark Nigrini, "Theory and applications of Benford's law to fraud detection", IRS Boston Offices talk, 2008. [PDF](https://web.williams.edu/Mathematics/sjmiller/public_html/math/talks/Benford_IRS_GeneralTalk_NoTab.pdf).
