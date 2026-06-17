---
layout: post
title: "The Curve Moves in Three Shadows"
description: "Yield curves are high-dimensional objects, but many daily moves look like mixtures of level, slope, and curvature. PCA makes that visible; risk still has to price the whole curve."
date: 2026-06-16 21:12:00 -0400
categories: quantitative-finance
tags: [yield-curve, fixed-income, pca, duration, convexity, nelson-siegel, risk-management, quantitative-finance]
excerpt: "The first three principal components of yield changes often look like level, slope, and curvature. That is a useful risk language, not proof that the bond market has only three causes."
---

A yield curve is a vector pretending to be a line.

At one moment it has a 6-month rate, a 2-year rate, a 10-year rate, a 30-year
rate, and everything between. Traders draw it as one smooth object because the
human eye likes continuity. Risk systems see a vector:

```text
[6m, 1y, 2y, 3y, 5y, 7y, 10y, 20y, 30y]
```

Then the day changes.

Which thing moved?

One answer is to name every maturity. Another is to find the few shapes that
explain most of the movement. In fixed income, those shapes have familiar
nicknames:

```text
level
slope
curvature
```

The first lifts or lowers the whole curve. The second twists short rates
against long rates. The third bends the belly against the wings.

This is not just market poetry. Litterman and Scheinkman used principal
components to show that a small number of common factors explained much of the
variation in Treasury-based bond returns, with the factors corresponding to
level, steepness, and curvature.[^litterman-scheinkman] The names stuck because
the pictures were useful.

Useful is not the same as complete.

## A Curve Lab

The lab below simulates daily yield changes across nine maturities. The hidden
data-generating process uses three smooth shapes, then adds idiosyncratic
maturity noise. The browser computes the covariance matrix of yield changes,
does a Jacobi eigen-decomposition, orients the first three principal components,
and prices a zero-coupon curve shock exactly.

The default run is deliberately clean: the first principal component explains
about `73.9%` of variance, and the first three explain about `93.3%`. The
10-year zero-coupon return under the default shock is about `-1.21%`; the pure
duration approximation is about `-1.22%`.

Move **Noise** upward. The three-factor story degrades. Move **Slope shock** or
**Curvature shock** and watch the price damage migrate across maturities.

<style>
  .yc-lab {
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

  .yc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .yc-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .yc-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .yc-lab input,
  .yc-lab select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .yc-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .yc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .yc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .yc-lab__metric span,
  .yc-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .yc-lab__metric span {
    display: block;
  }

  .yc-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .yc-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .yc-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="yield-curve-pca-lab" class="yc-lab" data-yield-curve-pca-lab>
  <div class="yc-lab__controls">
    <label>
      Regime
      <select data-param="regime">
        <option value="normal" selected>ordinary cycle</option>
        <option value="policy">policy whiplash</option>
        <option value="inflation">inflation scare</option>
      </select>
    </label>
    <label>
      Sample days: <output data-value="days">650</output>
      <input type="range" min="220" max="1200" step="10" value="650" data-param="days">
    </label>
    <label>
      Noise: <output data-value="noise">1 bp</output>
      <input type="range" min="0" max="18" step="1" value="1" data-param="noise">
    </label>
    <label>
      Level shock: <output data-value="level">25 bp</output>
      <input type="range" min="-60" max="80" step="1" value="25" data-param="level">
    </label>
    <label>
      Slope shock: <output data-value="slope">-10 bp</output>
      <input type="range" min="-70" max="70" step="1" value="-10" data-param="slope">
    </label>
    <label>
      Curvature shock: <output data-value="curvature">8 bp</output>
      <input type="range" min="-40" max="40" step="1" value="8" data-param="curvature">
    </label>
    <label>
      Seed: <output data-value="seed">47</output>
      <input type="range" min="1" max="997" step="1" value="47" data-param="seed">
    </label>
  </div>
  <div class="yc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="540" aria-label="Yield curve PCA lab showing base and shocked zero curves, principal component loadings, explained variance, and zero-coupon return by maturity"></canvas>
  <p class="yc-lab__note">
    Deterministic browser experiment. Yields are simulated from smooth
    level/slope/curvature shocks plus maturity-specific noise; the principal
    components are estimated from the simulated changes, not hard-coded. The
    exported audit checks the PCA and pricing invariants behind the display.
  </p>
</div>
<script defer src="{{ '/assets/js/yield-curve-pca-lab.js?v=20260616b' | relative_url }}"></script>

The four panels are deliberately different views of the same object.

The top-left panel shows the zero curve before and after the factor shock. The
top-right panel shows estimated principal-component loadings. The bottom-left
panel is the variance ledger. The bottom-right panel prices the shock for
zero-coupon bonds of different maturities.

The important habit is to read the panels together.

```text
factor movement -> curve movement -> price movement
```

A 25 bp level shock is not a 25 bp price shock. Price damage is filtered through
maturity, duration, convexity, and the exact location of the curve move.

The reproducibility hook is `YieldCurvePcaLab.audit()`. It runs 5,084
deterministic checks over the simulated samples: covariance symmetry,
orthonormal eigenvectors, trace and explained-variance identities, reconstruction
from eigenpairs, sign-oriented PC shapes, noise degradation, exact zero-coupon
pricing, duration/convexity formulas, deterministic seeds, and input clamping.
The audit is intentionally fussy because a PCA chart can look plausible even
when the factor math has quietly drifted.

## PCA Is A Coordinate Choice

Principal components do not know what a central bank is.

They see a covariance matrix and choose orthogonal directions that explain
variance. If maturities move together, the first component will often look like
a level shift. If short rates move against long rates, another component will
look like slope. If the belly moves against the wings, another will look like
curvature.

That makes PCA a useful coordinate system for curve risk:

```text
portfolio exposure to PC1
portfolio exposure to PC2
portfolio exposure to PC3
```

But the labels are interpretations after the fact. The signs of eigenvectors
are arbitrary. The components depend on the sample window, maturities, data
frequency, transformations, and whether you use yields, yield changes, returns,
forward rates, or excess returns.

The New York Fed paper "Deconstructing the Yield Curve" is a good modern
caution. It notes that smooth ordered data can produce principal-component
loadings with familiar shapes, and that strong persistence can make low-factor
structure look cleaner than it really is unless the data are transformed
carefully.[^nyfed]

So the right sentence is not:

```text
there are exactly three forces in interest rates
```

It is:

```text
in this representation and sample, three smooth directions explain a lot of
observed variation
```

Less dramatic. More useful.

## Nelson-Siegel Is The Other Map

PCA learns loadings from a sample. Nelson-Siegel starts with a functional shape.

Nelson and Siegel introduced a parsimonious curve model whose components can
represent monotonic, humped, and S-shaped yield curves.[^nelson-siegel] In the
common Diebold-Li interpretation, the three time-varying coefficients are read
as level, slope, and curvature factors; Diebold and Li then forecast those
factors dynamically.[^diebold-li]

The difference matters.

PCA says:

```text
given these data, here are the orthogonal directions that explained variance
```

Nelson-Siegel says:

```text
given this basis, here are the factor coefficients that fit the curve
```

The lab borrows Nelson-Siegel-like smooth basis functions to generate data, but
then it makes PCA rediscover the directions from simulated changes. That is why
raising **Noise** breaks the clean story. The hidden basis is still there, but
the covariance matrix sees more maturity-specific disturbance.

## Duration Is A Local Linear Story

For a zero-coupon bond with maturity $$T$$ and continuously compounded yield
$$y$$,

$$
P=e^{-yT}.
$$

A small yield change $$\Delta y$$ gives the first-order approximation

$$
\frac{\Delta P}{P} \approx -T\Delta y.
$$

That is duration. Add the next term,

$$
\frac{\Delta P}{P} \approx -T\Delta y + \frac{1}{2}T^2(\Delta y)^2,
$$

and you see convexity.

For small shocks, the duration line is nearly enough. For large shocks and long
maturities, the curve in price-yield space starts to matter. In the lab, the
bottom-right panel compares exact zero-coupon returns against the
duration-plus-convexity approximation. It is close for the default shock because
the move is modest. Push **Level shock** hard and long maturities remind you why
fixed-income risk managers do not stop at DV01.

This also explains why "the curve moved 20 bp" is an incomplete statement. A
20 bp move at the 6-month point and a 20 bp move at the 30-year point have very
different price consequences.

## What The Three Shadows Hide

The level/slope/curvature language is powerful because it compresses.

It is dangerous for the same reason.

A curve move can be:

- a monetary-policy surprise concentrated at the front end;
- an inflation-risk repricing at the long end;
- a liquidity premium in specific tenors;
- a collateral or scarcity effect;
- a flight-to-quality move;
- an issuance-supply effect;
- a measurement artifact from bootstrapping and interpolation.

Some of those will project neatly onto three principal components. Some will
not. Some will look like a familiar factor until the portfolio contains the one
instrument whose basis risk is in the residual.

That residual matters. If a hedging book is neutral to PC1, PC2, and PC3, it is
not neutral to the yield curve. It is neutral to the first three directions in a
particular historical coordinate system.

The leftover directions may be small most days. They are allowed to matter on
the day you care about.

## The Report I Want

For a real curve-risk report, I would want:

- the maturities and instruments used to build the curve;
- whether PCA was applied to yields, yield changes, forwards, returns, or excess
  returns;
- the sample window and data frequency;
- explained variance by component;
- component loadings, with sign conventions stated;
- portfolio exposures to each factor;
- residual risk outside the selected factors;
- scenario shocks that are not constrained to historical PCs;
- price P&L, not just yield movement;
- stress tests for local curve moves and basis breaks.

The last two are where the risk becomes real. Factors describe the curve. Money
is lost through instruments.

## A Useful Lie, Kept Honest

Level, slope, and curvature are a useful lie.

They are not false. They are a compression. They let a desk say "we are long the
belly" or "this book is exposed to a bear steepener" without listing every
maturity. They let a model forecast a curve by forecasting a few factors. They
let a risk report turn a smooth object into a ledger.

But the curve is still a vector. Every compression should leave a receipt:

```text
what was explained?
what was ignored?
what portfolio was priced?
what scenario would hurt anyway?
```

The yield curve moves in three shadows often enough that the shadows deserve
names.

Just do not mistake the shadows for the whole room.

## Paper Trail

[^litterman-scheinkman]: Robert Litterman and Jose Scheinkman, ["Common Factors Affecting Bond Returns"](https://math.nyu.edu/faculty/avellane/Litterman1991.pdf), *Journal of Fixed Income*, 1991. A short practitioner summary is Tao Wu, ["What Makes the Yield Curve Move?"](https://www.soa.org/globalassets/assets/library/newsletters/risks-and-rewards/2003/october/rar-2003-iss42-wu.pdf), Federal Reserve Bank of San Francisco Economic Letter, 2003.

[^nelson-siegel]: Charles R. Nelson and Andrew F. Siegel, ["Parsimonious Modeling of Yield Curves"](https://econpapers.repec.org/article/ucpjnlbus/v_3a60_3ay_3a1987_3ai_3a4_3ap_3a473-89.htm), *Journal of Business*, 1987. Author-hosted PDF: [Bocconi mirror](https://didattica.unibocconi.it/mypage/upload/NELSON_SIEGEL20081008161957.PDF).

[^diebold-li]: Francis X. Diebold and Canlin Li, ["Forecasting the Term Structure of Government Bond Yields"](https://ideas.repec.org/a/eee/econom/v130y2006i2p337-364.html), *Journal of Econometrics*, 2006. Working-paper PDF: [UCM mirror](https://www.ucm.es/data/cont/media/www/pag-41460/Diebold.pdf).

[^nyfed]: Richard K. Crump and Nikolay Gospodinov, ["Deconstructing the Yield Curve"](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr884.pdf), Federal Reserve Bank of New York Staff Report No. 884, revised 2024.
