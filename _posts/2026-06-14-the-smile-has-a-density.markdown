---
layout: post
title: "Volatility Smiles Have Densities"
description: "A volatility smile is not just a curve of Black-Scholes inputs. Through call-price curvature, it encodes a risk-neutral density and exposes static arbitrage."
date: 2026-06-14 14:54:00 -0400
categories: quantitative-finance
tags: [option-pricing, implied-volatility, risk-neutral-density, static-arbitrage, quantitative-finance]
excerpt: "The implied-volatility smile is a coordinate system. The object underneath is the call-price surface, and its curvature is a probability density only when convexity survives."
---

An implied-volatility smile is easy to look at and hard to read.

Traders quote a volatility for each strike because Black-Scholes gives a common
language: take the observed option price, invert the Black-Scholes formula, and
report the volatility that would have produced that price.[^blackscholes] If all
the assumptions of the model were literally true, every strike at a fixed
maturity would give the same number. Markets do not do that. Low strikes, high
strikes, crash protection, supply and demand, jumps, stochastic volatility, and
risk premia all leave shape in the cross-section.

That shape is the smile.

But the smile is not the primitive object. The primitive object is the option
price as a function of strike:

$$
C(K,T).
$$

The smile is a reparameterization of that price curve. This matters because
probabilities, state prices, and arbitrage constraints live in price space, not
volatility space. A smooth-looking implied-volatility curve can still imply a
bad call-price curve. A slightly noisy quote sheet can make the second
derivative explode. A fitted surface can look elegant and still create a free
butterfly.

The right mental move is:

```text
do not ask what the smile looks like;
ask what density its call prices imply
```

## Curvature Is A State Price

At a fixed maturity \(T\), the no-arbitrage price of a European call is the
discounted risk-neutral expectation of its payoff:

$$
C(K,T) = e^{-rT}\mathbb{E}^Q[(S_T-K)^+].
$$

Writing the terminal density as \(q_T(s)\),

$$
C(K,T)
= e^{-rT}\int_K^\infty (s-K)q_T(s)\,ds.
$$

Differentiate once with respect to strike:

$$
\frac{\partial C}{\partial K}
= -e^{-rT}Q(S_T>K).
$$

Differentiate again:

$$
\frac{\partial^2 C}{\partial K^2}
= e^{-rT}q_T(K).
$$

So:

$$
q_T(K) = e^{rT}\frac{\partial^2 C}{\partial K^2}.
$$

This is the Breeden-Litzenberger identity.[^breeden] It says that the curvature
of the call-price curve is the terminal risk-neutral density.

There is an almost physical intuition behind it. A narrow butterfly spread:

$$
C(K-h)-2C(K)+C(K+h)
$$

pays off mostly when the terminal price lands near \(K\). If that butterfly has
a negative price, then the market is paying you to buy a nonnegative payoff. That
is static arbitrage. In the continuous limit, a strip of tiny butterflies
becomes the second derivative of the call curve.

That gives three basic no-arbitrage tests for a call curve at one maturity:

```text
price is bounded by intrinsic value and spot
price decreases as strike rises
price is convex in strike
```

The first two are easy to see. The third is the one the smile quietly tests.
Convexity is not an aesthetic preference. It is nonnegative state-price density.

## The Smile Lab

The lab below builds a synthetic option sheet. It starts with a Black-Scholes
price at each strike, using a configurable implied-volatility smile. Then it can
add deterministic quote roughness and optionally smooth prices before computing
finite-difference curvature.

The purple bars are the Breeden-Litzenberger density estimate. Red bars are
negative density. The butterfly panel shows the same information in tradeable
units: each bar is the value of a one-step call butterfly. Negative bars are
convexity violations.

<div class="smile-lab" data-smile-lab>
  <div class="smile-lab__controls">
    <label>
      ATM volatility <output data-value="atmVol">22%</output>
      <input type="range" data-param="atmVol" min="8" max="65" step="1" value="22" aria-label="ATM volatility">
    </label>
    <label>
      Downside skew <output data-value="skew">38</output>
      <input type="range" data-param="skew" min="-20" max="90" step="1" value="38" aria-label="Downside skew">
    </label>
    <label>
      Smile curvature <output data-value="curvature">24</output>
      <input type="range" data-param="curvature" min="0" max="90" step="1" value="24" aria-label="Smile curvature">
    </label>
    <label>
      Maturity days <output data-value="maturityDays">180</output>
      <input type="range" data-param="maturityDays" min="21" max="730" step="1" value="180" aria-label="Maturity days">
    </label>
    <label>
      Quote roughness <output data-value="quoteRoughness">0</output>
      <input type="range" data-param="quoteRoughness" min="0" max="100" step="1" value="0" aria-label="Quote roughness">
    </label>
    <label>
      Smoothing passes <output data-value="smoothing">1</output>
      <input type="range" data-param="smoothing" min="0" max="5" step="1" value="1" aria-label="Smoothing passes">
    </label>
  </div>
  <div class="smile-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Option smile lab showing implied volatility, call price convexity, Breeden-Litzenberger density, and butterfly arbitrage checks"></canvas>
  <div class="smile-lab__legend">
    <span><i style="background:#2563eb"></i>Implied volatility</span>
    <span><i style="background:#0f766e"></i>Call price curve</span>
    <span><i style="background:#7c3aed"></i>Risk-neutral density</span>
    <span><i style="background:#b45309"></i>Positive butterfly</span>
    <span><i style="background:#be123c"></i>Violation</span>
  </div>
  <p class="smile-lab__note">
    The density is estimated by central finite differences on call prices:
    \(q(K)\approx e^{rT}(C_{K-h}-2C_K+C_{K+h})/h^2\). The finite strike grid
    runs from 30 to 190 with spot fixed at 100, so extreme tail mass outside
    the grid is intentionally small but not modeled in detail.
  </p>
</div>

<script src="{{ '/assets/js/smile-density-lab.js' | relative_url }}"></script>

Start with the default smooth surface. Probability mass should be close to one,
the density mean should sit near the forward, and the minimum butterfly should
be nonnegative. The smile is sloped and curved, but the price curve is still a
valid collection of discounted payoffs.

Now raise **Quote roughness**. The implied volatility panel may still look like a
market-ish smile. The density panel becomes fragile immediately. This is the
curse of second derivatives: small quote wiggles become large curvature wiggles.
If the red bars appear, the surface is no longer just noisy. It is asking for
negative probability in some strike region.

Raise **Smoothing passes**. The red bars may shrink, but smoothing is not a
license to average away economics. A production surface fit has to enforce
arbitrage constraints, respect bid-ask spreads, and behave sensibly across
maturity. A pretty spline is not enough.

## Risk-Neutral Is Not Real-World

The density in the lab is risk-neutral.

That word carries a lot of weight. A risk-neutral density is the probability
measure under which discounted traded prices are martingales. It is the measure
that prices payoffs, not necessarily the measure that describes what investors
believe will happen.

The NY Fed's practical guide to extracting option-based risk-neutral densities
states this warning plainly: option-implied risk-neutral probabilities can move
because real-world probabilities moved, because risk preferences moved, or
because both moved.[^malz] A crash state can have a high risk-neutral price
because investors think the crash is likely, because they hate paying off in
that state, or because crash insurance is temporarily scarce.

This is why the density should not be read as:

```text
the market's honest forecast
```

It is closer to:

```text
the market's state-price-weighted forecast
```

That distinction is not philosophical decoration. If you use option-implied
density to forecast returns, size tail hedges, or explain variance premia, you
are mixing probability and marginal utility. Sometimes that is exactly what you
want. Sometimes it is a category error.

## Volatility Is A Coordinate System

Black-Scholes gives a one-to-one map from a European call price to an implied
volatility, holding spot, strike, rate, and maturity fixed. That makes volatility
convenient as a quote language. It does not make volatility the underlying
state.

For example, a linearly interpolated implied-volatility curve can generate a
call-price curve whose curvature oscillates. The volatility interpolation looks
reasonable because volatility is smooth. But the no-arbitrage condition is not
"volatility should be smooth." It is "call price should be convex in strike."

This is one reason volatility surface construction is a craft. The fitting
procedure is doing several jobs at once:

- denoise sparse and bid-ask-contaminated quotes;
- interpolate liquid strikes without inventing arbitrage;
- extrapolate tails without creating impossible digital prices;
- align maturities so calendar spreads do not go negative;
- produce stable Greeks for hedging and risk.

The single-maturity lab only checks vertical spread and butterfly conditions.
A full surface has another dimension: maturity. Calendar no-arbitrage requires
option prices to behave consistently as time to expiration changes. Dupire's
local-volatility formula goes further, using derivatives of the option surface
across strike and maturity to infer an instantaneous volatility function.[^dupire]
That makes the surface even more sensitive to bad derivatives. If the input
surface is not arbitrage-clean, the local volatility can become negative,
explosive, or meaningless.

## The Derivative Amplifies The Lie

The dangerous part of the Breeden-Litzenberger identity is not the algebra. It is
the numerical operation.

First derivatives amplify noise. Second derivatives amplify it harder. In the
lab, quote roughness is only a small deterministic perturbation to the call
sheet. The call-price panel may barely look disturbed, but the density can
sprout alternating positive and negative spikes. This is exactly what happens
when one tries to extract a distribution directly from stale, crossed, or
illiquid option quotes.

The object one wants is smooth enough to differentiate. The object one observes
is a market sheet with frictions:

```text
discrete strikes
bid-ask spreads
stale quotes
early-exercise contamination
dividend assumptions
funding assumptions
microstructure noise
```

Every one of those can leak into the second derivative.

That is why an option-density workflow should look less like "differentiate the
spreadsheet" and more like a constrained inference problem:

1. Convert quotes to forward-consistent prices.
2. Remove or downweight crossed, stale, and tiny-vega quotes.
3. Fit a curve or surface under explicit no-arbitrage constraints.
4. Differentiate the fitted price curve, not raw marks.
5. Check the implied density mass, mean, tails, and butterfly prices.
6. Compare results across smoothing assumptions.

The last step is not optional. If the density changes qualitatively when the
smoother changes, the data are not telling a single story.

## What The Smile Is Saying

A volatility smile is often introduced as evidence that Black-Scholes is wrong.
That is true but incomplete. The more useful statement is:

```text
the market prices different terminal states differently than a single lognormal
Black-Scholes distribution would
```

Low-strike equity index puts often carry high implied volatility because bad
states are expensive. Out-of-the-money calls can become expensive in meme-stock,
commodity squeeze, or event-driven regimes. Short maturities can kink around
earnings, central-bank meetings, legal decisions, or liquidation events. The
smile is a compact way of quoting all that state dependence.

But the smile only earns its interpretation after the price curve passes the
static-arbitrage tests. Before that, it is just a drawing.

The deeper lesson is almost embarrassingly geometric:

```text
prices have shape;
shape has consequences
```

Slope is a digital price. Curvature is a state price. Negative curvature is a
free butterfly. And the attractive volatility smile on the screen is only a
safe object if the invisible price surface underneath is convex where it has to
be convex.

[^blackscholes]: Fischer Black and Myron Scholes, ["The Pricing of Options and Corporate Liabilities"](https://www.journals.uchicago.edu/doi/10.1086/260062), *Journal of Political Economy* 81(3), 1973. A public PDF copy is available from [Simon Fraser University](https://www.sfu.ca/~kkasa/BlackScholes_73.pdf).

[^breeden]: Douglas T. Breeden and Robert H. Litzenberger, ["Prices of State-Contingent Claims Implicit in Option Prices"](https://ideas.repec.org/a/ucp/jnlbus/v51y1978i4p621-51.html), *Journal of Business* 51(4), 1978. See also the [SSRN record](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2642349).

[^malz]: Allan M. Malz, ["A Simple and Reliable Way to Compute Option-Based Risk-Neutral Distributions"](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr677.pdf), Federal Reserve Bank of New York Staff Report No. 677, 2014.

[^dupire]: Bruno Dupire, ["Pricing and Hedging with Smiles"](https://globalriskguard.com/resources/deriv/pric_hedg_with_smile.pdf), Paribas Capital Markets working paper, 1993; the related Risk article is commonly cited as "Pricing with a Smile," *Risk* 7, 1994.
