---
layout: post
title: "Epsilon Is Not a Purse"
description: "Differential privacy is easier to reason about when epsilon is a likelihood-ratio threshold, delta is tail slack, and the accountant keeps the whole curve alive."
date: 2026-06-14 20:05:00 -0400
categories: computer-science
tags: [differential-privacy, gaussian-mechanism, renyi-differential-privacy, privacy-loss, machine-learning, statistics]
excerpt: "A privacy budget is not a little purse of secrecy coins. For Gaussian mechanisms, the useful object is the tail of a privacy-loss random variable."
---

A privacy budget sounds like a purse.

Spend a little here, spend a little there, and eventually the purse is empty.
That metaphor is convenient. It is also too round. It hides the object that
actually composes.

The object is a random variable.

For two neighboring databases \(x\) and \(x'\), and a randomized mechanism
\(M\), define the privacy loss at output \(y\) as

$$
L(y)=\log\frac{p_{M(x)}(y)}{p_{M(x')}(y)}.
$$

This number says how much more the observed output looks like it came from
\(x\) than from \(x'\). Differential privacy is a promise that this comparison
cannot get too large, except for a carefully bounded failure tail.

The usual \((\varepsilon,\delta)\)-definition says that for every event \(S\),

$$
\Pr[M(x)\in S]\le e^\varepsilon \Pr[M(x')\in S]+\delta.
$$

That is not the same as saying "the chance of a privacy violation is
\(\delta\)." It is a distributional inequality over all events an adversary
might choose after seeing the mechanism. But for common mechanisms, especially
Gaussian output perturbation, the privacy-loss variable gives a very useful
coordinate system for seeing what the inequality is controlling.

The budget is not only a scalar.

It is a tail shape.

## Sensitivity Is the Doorway

Dwork, McSherry, Nissim, and Smith gave the classic sensitivity view: if
changing one database row can only move a query answer a little, then adding
noise calibrated to that movement can protect the row.[^dwork]

For a scalar count with sensitivity one, neighboring databases can shift the
true answer by at most one. A Gaussian mechanism releases

$$
M(x)=f(x)+Z,\qquad Z\sim N(0,\sigma^2).
$$

The neighboring output distributions are two Gaussians with equal variance and
means separated by at most one.

The privacy-loss random variable is then also Gaussian. Balle and Wang state
the general form for Gaussian output perturbation: if the two means are
separated by distance \(D\), then

$$
L\sim N(\eta,2\eta),
\qquad
\eta=\frac{D^2}{2\sigma^2}.
$$

That formula is the first mental click. More noise shrinks both the mean and
variance of privacy loss. More releases, or a larger sensitivity vector,
increase them.

If we run \(k\) independent unit-sensitivity Gaussian releases, the joint output
is a \(k\)-dimensional Gaussian. The neighboring means can be separated by
\(\sqrt{k}\), so

$$
L_k\sim N\left(\frac{k}{2\sigma^2},\frac{k}{\sigma^2}\right).
$$

The privacy loss grows like a drifted random walk.

Not like a purse with coins removed.

## The Tail Is Not the Whole DP Curve

The tempting sufficient check is:

$$
\Pr[L>\varepsilon]\le\delta.
$$

This is intuitive. It is also not the tight \((\varepsilon,\delta)\) guarantee
for the Gaussian mechanism.

Balle and Wang's analytic Gaussian mechanism gives the exact condition for
Gaussian output perturbation with \(L_2\)-sensitivity \(\Delta\):[^balle-wang]

$$
\Phi\left(\frac{\Delta}{2\sigma}-\frac{\varepsilon\sigma}{\Delta}\right)
-e^\varepsilon
\Phi\left(-\frac{\Delta}{2\sigma}-\frac{\varepsilon\sigma}{\Delta}\right)
\le \delta.
$$

The first term is the one-sided privacy-loss tail. The second term subtracts a
mirror tail from the neighboring distribution, scaled by \(e^\varepsilon\). In
the language of divergences, this is the hockey-stick distance. It is the right
quantity for approximate DP.

So there are three numbers worth separating:

```text
Pr[L > epsilon]       one-sided privacy-loss tail
delta(epsilon)        exact approximate-DP curve
epsilon(delta)        the reported point on that curve
```

The first one is pedagogically useful. The second one is the guarantee. The
third one is a report.

## A Tiny Accountant

The lab below studies the simplest transcript: repeat a unit-sensitivity
Gaussian release \(k\) times with independent noise of standard deviation
\(\sigma\).

It computes three \(\varepsilon\) values for the selected \(\delta\):

- **Exact epsilon** solves the analytic Gaussian DP equation.
- **Tail epsilon** solves \(\Pr[L_k>\varepsilon]\le\delta\).
- **RDP epsilon** uses the Renyi differential privacy accountant.

The default setting uses `sigma = 8`, `k = 120`, and `delta = 1e-6`. It gives:

```text
exact epsilon   7.02
tail epsilon    7.45
RDP epsilon     8.14
```

The inequalities are the point. A sufficient tail bound is conservative. The
RDP conversion is also conservative, but it composes cleanly and generalizes
well. Mironov introduced Renyi differential privacy partly because the full
curve of privacy guarantees composes more naturally than a single chosen
\((\varepsilon,\delta)\) point.[^mironov]

I audited those numbers against the lab implementation. At the default
`epsilon = 6.0`, the analytic Gaussian curve reports `delta = 2.726e-5`, while
the one-sided privacy-loss tail is `1.090e-4`; both sit above the `1e-6` target.
Across `1,296` combinations of noise, releases, delta, probe epsilon, sample
count, and seed, every numerical check passed: finite accountants, monotone
delta curves, bounded probabilities, and exact Gaussian epsilon no larger than
the tail or RDP reports.

Move the **Epsilon probe**. At `epsilon = 6.0`, the exact Gaussian curve gives
about `2.7e-5`, which misses the `1e-6` target. Slide it toward the exact
epsilon and watch the curve cross the target line.

<style>
  .privacy-lab {
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

  .privacy-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(144px, 1fr));
  }

  .privacy-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .privacy-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .privacy-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .privacy-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .privacy-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .privacy-lab__metric span,
  .privacy-lab__legend,
  .privacy-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .privacy-lab__metric span {
    display: block;
  }

  .privacy-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .privacy-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .privacy-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .privacy-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .privacy-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .privacy-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="privacy-lab" data-privacy-lab>
  <div class="privacy-lab__controls">
    <label>
      Noise sigma: <output data-value="sigma">8.0</output>
      <input type="range" min="10" max="120" step="1" value="80" data-param="sigma">
    </label>
    <label>
      Releases: <output data-value="releases">120</output>
      <input type="range" min="1" max="400" step="1" value="120" data-param="releases">
    </label>
    <label>
      Target delta: <output data-value="deltaExp">1e-6</output>
      <input type="range" min="3" max="12" step="1" value="6" data-param="deltaExp">
    </label>
    <label>
      Epsilon probe: <output data-value="epsilon">6.0</output>
      <input type="range" min="0" max="160" step="1" value="60" data-param="epsilon">
    </label>
    <label>
      Monte Carlo draws: <output data-value="samples">5000</output>
      <input type="range" min="1000" max="9000" step="500" value="5000" data-param="samples">
    </label>
    <label>
      Seed: <output data-value="seed">31</output>
      <input type="range" min="1" max="9999" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="privacy-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Differential privacy lab showing privacy-loss distributions, Gaussian DP delta curves, and Renyi composition accounting"></canvas>
  <div class="privacy-lab__legend" aria-hidden="true">
    <span><i style="background:#0f766e"></i>exact Gaussian DP</span>
    <span><i style="background:#2563eb"></i>RDP conversion</span>
    <span><i style="background:#dc2626"></i>one-sided tail</span>
    <span><i style="background:#f59e0b"></i>Monte Carlo</span>
  </div>
  <p class="privacy-lab__note">
    This is the repeated Gaussian mechanism, not a full DP-SGD accountant.
    Subsampling, clipping, adaptive queries, floating point, and privacy-unit
    definitions matter in production systems.
  </p>
</div>

<script src="{{ '/assets/js/privacy-loss-lab.js?v=20260614a' | relative_url }}"></script>

## Why RDP Is the Accountant's Curve

For one unit-sensitivity Gaussian release, Mironov gives the clean Renyi
divergence formula

$$
D_\alpha(N(0,\sigma^2)\|N(1,\sigma^2))
=
\frac{\alpha}{2\sigma^2}.
$$

Thus the mechanism is \((\alpha,\alpha/(2\sigma^2))\)-RDP. After \(k\)
releases, the RDP curve simply adds:

$$
\varepsilon_{\mathrm{RDP}}(\alpha)
=
\frac{k\alpha}{2\sigma^2}.
$$

To report an \((\varepsilon,\delta)\) point, use the standard conversion

$$
\varepsilon(\alpha,\delta)
=
\frac{k\alpha}{2\sigma^2}
+
\frac{\log(1/\delta)}{\alpha-1},
\qquad \alpha>1.
$$

The lab plots this curve over \(\alpha\) and marks the minimizing order. The
minimum is not a new privacy mechanism. It is the best report obtained from the
RDP curve for the chosen \(\delta\).

This is why a privacy accountant should keep a curve as long as possible. A
single epsilon at a single delta forgets how the mechanism will compose with
the next mechanism.

Abadi et al.'s DP-SGD paper popularized the moments accountant for private deep
learning; they describe it as useful for theoretical and empirical analysis of
complex privacy-preserving algorithms.[^abadi] Modern RDP accountants are close
relatives of that idea. The common habit is to track a moment or divergence
curve during composition, then convert to the public \((\varepsilon,\delta)\)
language at the end.

## What the Lab Is Not Saying

The lab is intentionally narrow.

It assumes:

- the query has unit \(L_2\)-sensitivity;
- each release uses independent Gaussian noise;
- the same person can affect every release;
- there is no subsampling amplification;
- the noise distribution is exact mathematical Gaussian noise.

Those assumptions make the algebra visible. They are not a license to eyeball a
production system.

For DP-SGD, one must account for gradient clipping, Poisson or minibatch
subsampling, repeated adaptive training steps, the chosen neighboring relation,
and implementation details. For published statistics, one must know whether
privacy is person-level, row-level, user-level, household-level, or event-level.
The sensitivity unit is a policy and modeling decision before it is an equation.

Still, the toy model teaches the posture:

```text
do not ask only "what is epsilon?"
ask "which curve produced that epsilon?"
```

## The Bad Budget Metaphor

The phrase "privacy budget" is not wrong. Composition really does accumulate.
But the metaphor becomes dangerous when it makes epsilon feel like a linear
resource with a natural unit.

Epsilon is a log likelihood-ratio threshold. \(e^\varepsilon\) is a
multiplicative factor. Delta is not a harmless probability of embarrassment; it
is an additive slack in a worst-case event inequality. Changing delta changes
the epsilon you report. Changing the neighboring relation changes the meaning
of the entire guarantee.

Even in the friendly Gaussian case, the mechanism has a full curve. You can
choose a point on it for communication, regulation, or product policy. But the
point is not the mechanism.

The mechanism is the pair of neighboring output distributions.

The accountant's job is to keep their tails honest.

## A Useful Engineering Rule

When reviewing a differentially private system, I want four artifacts:

- the neighboring relation;
- the sensitivity or clipping argument;
- the accountant curve, not only the final epsilon;
- the numerical implementation details for noise and random sampling.

The first tells me whose privacy unit is being protected. The second tells me
how much one unit can move the computation. The third tells me how privacy loss
was composed. The fourth tells me whether the proof survived contact with
floating point and software.

Without those artifacts, a reported epsilon is a number with its scaffolding
removed.

With them, it becomes a compact summary of a tail bound.

[^dwork]: Cynthia Dwork, Frank McSherry, Kobbi Nissim, and Adam Smith, "Calibrating Noise to Sensitivity in Private Data Analysis", TCC 2006. The paper defines sensitivity and analyzes noise calibrated to it. [PDF](https://people.csail.mit.edu/asmith/PS/sensitivity-tcc-final.pdf); [Springer record](https://link.springer.com/chapter/10.1007/11681878_14).

[^balle-wang]: Borja Balle and Yu-Xiang Wang, "Improving the Gaussian Mechanism for Differential Privacy: Analytical Calibration and Optimal Denoising", ICML 2018. The paper derives the Gaussian privacy-loss distribution and the analytic Gaussian mechanism condition. [PDF](https://proceedings.mlr.press/v80/balle18a/balle18a.pdf); [PMLR page](https://proceedings.mlr.press/v80/balle18a.html).

[^mironov]: Ilya Mironov, "Renyi Differential Privacy", IEEE CSF 2017. The paper introduces RDP as a way to represent privacy-loss tails and compose privacy guarantees through budget curves. [PDF](https://research.google.com/pubs/archive/94f0c4630a20ba7981b5237abfc7743d14d3cf4b.pdf); [arXiv](https://arxiv.org/abs/1702.07476).

[^abadi]: Martin Abadi, Andy Chu, Ian Goodfellow, H. Brendan McMahan, Ilya Mironov, Kunal Talwar, and Li Zhang, "Deep Learning with Differential Privacy", CCS 2016. The paper uses the moments accountant for privacy analysis of DP-SGD. [arXiv PDF](https://arxiv.org/pdf/1607.00133).
