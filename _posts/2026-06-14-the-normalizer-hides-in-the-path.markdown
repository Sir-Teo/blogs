---
layout: post
title: "Normalizers Hide in the Path"
description: "Annealed importance sampling estimates a partition function by walking through easier distributions and averaging the resulting path weights."
date: 2026-06-14 20:15:00 -0400
categories: applied-math
tags: [annealed-importance-sampling, monte-carlo, normalizing-constants, bayesian-computation, statistical-physics, importance-sampling]
excerpt: "A probability density can be easy to evaluate up to scale and still hard to normalize. Annealed importance sampling turns that missing scale into a weighted path."
---

Some probabilities are almost known.

You can write the energy. You can compare two states. You can run a Markov
chain that prefers lower energy states. You can even draw a convincing picture
of the distribution.

But one number is missing:

$$
Z=\int f(x)\,dx.
$$

That number is the normalizing constant. In statistical physics it is the
partition function. In Bayesian model comparison it is the marginal likelihood.
In energy-based modeling it is the thing that turns scores into probabilities.

The normalizer is quiet until you need to compare models.

Then it becomes the whole problem.

## The Scale That MCMC Does Not Need

Metropolis-Hastings can sample from a density known only up to a constant. If
the target is

$$
p(x)=\frac{f(x)}{Z},
$$

the acceptance ratio only needs ratios such as \(f(x')/f(x)\). The \(Z\) cancels.

That cancellation is a gift for sampling.

It is not a gift for estimating \(Z\).

A crude importance sampler starts from a normalized proposal \(q\), draws
\(x_i\sim q\), and estimates

$$
Z=\mathbb{E}_q\left[\frac{f(X)}{q(X)}\right].
$$

This is correct and often miserable. If \(q\) is broad and the target mass lives
in isolated regions, most samples have small weight. A few rare samples own the
average. The estimator may have the right expectation while the run in front of
you has not seen the events that make that expectation true.

The normalizer is an expectation dominated by the places your proposal does not
visit often enough.

## Bridges Instead of a Jump

Annealed importance sampling, introduced by Radford Neal, turns one bad jump
into a path of easier jumps.[^neal]

Start with a normalized base density \(p_0(x)=f_0(x)/Z_0\), usually chosen so
that \(Z_0\) is known. End at the unnormalized target \(f_1\). Between them,
define a sequence

$$
f_{\beta}(x)=f_0(x)^{1-\beta} f_1(x)^\beta,
\qquad
0=\beta_0<\beta_1<\cdots<\beta_m=1.
$$

For one AIS run:

1. draw \(x_0\sim p_0\);
2. for each bridge \(j\), multiply the weight by
   \(f_{\beta_j}(x_{j-1})/f_{\beta_{j-1}}(x_{j-1})\);
3. move \(x_{j-1}\) with a Markov transition that leaves
   \(p_{\beta_j}\propto f_{\beta_j}\) invariant.

The path weight is

$$
w=
\prod_{j=1}^{m}
\frac{f_{\beta_j}(x_{j-1})}{f_{\beta_{j-1}}(x_{j-1})}.
$$

Under the AIS construction,

$$
\mathbb{E}[w]=\frac{Z_1}{Z_0}.
$$

If \(Z_0=1\), averaging the AIS weights estimates the target normalizer.

The path is allowed to be out of equilibrium. The weights correct for that.
This is why AIS sits close to Jarzynski's equality in statistical physics:
Jarzynski related a free-energy difference to an exponential average of
nonequilibrium work.[^jarzynski] Neal noted the connection explicitly.

The practical warning is the same in both languages:

```text
average the exponentiated work/weights first
take the logarithm second
```

The log of the average and the average of the logs are not interchangeable.
Jensen's inequality is not a rounding error.

## A Two-Well Test

The lab below uses a target density with two isolated modes:

$$
f_1(x,y)=
\exp\left(
-\frac{(x^2-a^2)^2}{2s^2}
-\frac{y^2}{2\tau^2}
\right).
$$

It has wells near \(x=\pm a\). The \(y\)-integral is analytic, and the
one-dimensional \(x\)-integral is computed by Simpson quadrature, so the lab has
a reference value for \(\log Z\).

The base distribution is a broad normalized Gaussian. The naive estimate draws
from that base and uses \(f_1/q\). The AIS estimate walks from base to target
through geometric bridges and uses short random-walk Metropolis moves at each
bridge.

With the default settings:

```text
mode separation       a = 3.0
annealing runs        900
bridges               48
MCMC moves / bridge   3
proposal step         0.55

exact log Z           0.465
AIS log Z             0.467
naive IS log Z        0.330
AIS ESS               262 / 900
naive ESS             33 / 900
acceptance            50%
```

Do not fetishize those digits. Change the seed and they move. The useful fact
is structural: the annealed path gives the proposal time to migrate into both
wells before the final target is fully sharp, while naive importance sampling
asks a broad Gaussian to hit the right thin regions in one shot.

<style>
  .ais-lab {
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

  .ais-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(144px, 1fr));
  }

  .ais-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .ais-lab__controls input,
  .ais-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .ais-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .ais-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .ais-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .ais-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .ais-lab__metric span,
  .ais-lab__legend,
  .ais-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ais-lab__metric span {
    display: block;
  }

  .ais-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .ais-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .ais-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .ais-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .ais-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .ais-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="ais-lab" data-ais-lab>
  <div class="ais-lab__controls">
    <label>
      Schedule
      <select data-param="schedule">
        <option value="cosine" selected>cosine</option>
        <option value="linear">linear</option>
        <option value="late">late-heavy</option>
      </select>
    </label>
    <label>
      Mode separation: <output data-value="separation">3.0</output>
      <input type="range" min="12" max="32" step="1" value="30" data-param="separation">
    </label>
    <label>
      Bridges: <output data-value="bridges">48</output>
      <input type="range" min="4" max="96" step="1" value="48" data-param="bridges">
    </label>
    <label>
      MCMC moves: <output data-value="moves">3</output>
      <input type="range" min="0" max="8" step="1" value="3" data-param="moves">
    </label>
    <label>
      Runs: <output data-value="runs">900</output>
      <input type="range" min="200" max="2200" step="100" value="900" data-param="runs">
    </label>
    <label>
      Proposal step: <output data-value="step">0.55</output>
      <input type="range" min="15" max="140" step="1" value="55" data-param="step">
    </label>
    <label>
      Seed: <output data-value="seed">19</output>
      <input type="range" min="1" max="9999" step="1" value="19" data-param="seed">
    </label>
  </div>
  <div class="ais-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Annealed importance sampling lab comparing naive importance sampling and AIS against a quadrature normalizing constant"></canvas>
  <div class="ais-lab__legend" aria-hidden="true">
    <span><i style="background:#0f766e"></i>exact quadrature</span>
    <span><i style="background:#2563eb"></i>AIS</span>
    <span><i style="background:#dc2626"></i>naive IS</span>
    <span><i style="background:#f59e0b"></i>path estimate</span>
  </div>
  <p class="ais-lab__note">
    The target is a two-dimensional toy density with a one-dimensional
    quadrature reference. The lesson is about estimator geometry, not a
    benchmark claim about a production Bayesian model.
  </p>
</div>

<script src="{{ '/assets/js/annealed-importance-lab.js?v=20260614a' | relative_url }}"></script>

## What the Sliders Teach

Set **MCMC moves** to zero.

AIS becomes a fancy-looking sequence of weights attached to points that never
move. The bridges still exist algebraically, but the particles do not migrate.
The estimate collapses toward ordinary importance sampling.

Lower **Bridges** to a small number.

The path becomes rough. The incremental weight jumps get larger, the effective
sample size drops, and the estimate starts depending more on rare favorable
trajectories.

Increase **Mode separation**.

The wells move farther apart. A random-walk kernel has a harder time moving
between them late in the path. If the base distribution sends too many runs
into one side and the intermediate kernels do not rebalance, the weighted mode
mass can drift away from one half. That is not a mathematical failure of AIS.
It is a computational failure of the chosen path and kernels.

This is the recurring theme:

```text
the estimator is correct for the path you can actually traverse
```

The proof gives the expectation. The simulation still has to find the important
parts of the weight distribution.

## Why the Log Estimate Is Biased

AIS estimates \(Z\) by averaging weights:

$$
\widehat Z=\frac{1}{R}\sum_{r=1}^{R}w_r.
$$

Under the ideal construction, \(\widehat Z\) is an unbiased estimator of
\(Z_1/Z_0\). But the thing we usually print is

$$
\log \widehat Z.
$$

That is biased downward in finite samples, because \(\log\) is concave:

$$
\mathbb{E}[\log \widehat Z]\le \log \mathbb{E}[\widehat Z].
$$

The bias is not a bug in the code. It is the price of reporting a logarithm of
a noisy positive estimate. In Bayesian model comparison, where log marginal
likelihoods are the natural currency, this matters.

Neal's paper is explicit about this point: one averages the estimates for the
ratio of normalizing constants, not the logs of those estimates.[^neal]

The lab's histogram panel is there to make that warning visible. A narrow,
well-behaved weight distribution is comfortable. A distribution with a long
right tail is a promise that the run may be missing its most important evidence.

## The Family Resemblance

Gelman and Meng framed normalizing-constant estimation as a family of methods:
importance sampling, bridge sampling, thermodynamic integration, and path
sampling.[^gelman-meng] AIS lives in that family. It uses a finite path of
bridges and Markov transitions to create an implicit proposal distribution.

Sequential Monte Carlo samplers generalize the idea further. Del Moral,
Doucet, and Jasra describe sampling through a sequence of distributions known
up to normalizing constants, using weighted particles and move steps.[^smc]
AIS is the no-resampling cousin: independent runs, weighted paths, one final
average.

That no-resampling choice is both clean and dangerous.

Clean, because each AIS trajectory is an independent estimator and the
normalizing-constant estimate has a simple form.

Dangerous, because a few huge weights can dominate the answer and there is no
resampling step to redistribute computational effort toward promising regions.

The right reaction is not "never use AIS." The right reaction is:

- run many independent trajectories;
- inspect effective sample size and weight tails;
- try reverse paths or bidirectional checks when possible;
- vary the temperature schedule;
- use kernels that can actually move at the intermediate distributions;
- remember that an accurate-looking log estimate can be lucky.

## The Research Taste

I like AIS because it says something general about hard integrals.

If direct comparison is brittle, do not compare directly. Build a path of
nearby comparisons. Then pay for the fact that the path was not perfectly
equilibrated by carrying weights.

That sentence applies beyond partition functions. It is the taste behind
continuation methods, homotopy algorithms, curriculum training, diffusion
samplers, tempering, and some forms of sequential design. Start where the
problem is easy. Move the problem slowly. Keep a ledger for the work done along
the way.

The ledger is the important part.

Annealing without weights is a heuristic.

Annealing with the right weights is an estimator.

[^neal]: Radford M. Neal, "Annealed Importance Sampling", *Statistics and Computing* 11, 125-139, 2001. The arXiv version states that AIS combines importance sampling with Markov chains and estimates ratios of normalizing constants. [arXiv PDF](https://arxiv.org/pdf/physics/9803008); [Springer page](https://link.springer.com/article/10.1023/A%3A1008923215028).

[^jarzynski]: C. Jarzynski, "A nonequilibrium equality for free energy differences", *Physical Review Letters* 78, 2690, 1997. [arXiv](https://arxiv.org/abs/cond-mat/9610209); [DOI](https://link.aps.org/doi/10.1103/PhysRevLett.78.2690).

[^gelman-meng]: Andrew Gelman and Xiao-Li Meng, "Simulating Normalizing Constants: From Importance Sampling to Bridge Sampling to Path Sampling", *Statistical Science* 13(2), 163-185, 1998. [PDF](https://www2.stat.duke.edu/homeweb/scs/Courses/Stat376/Papers/NormConstants/GelmanMengStatSci1998.pdf); [Project Euclid](https://projecteuclid.org/journals/statistical-science/volume-13/issue-2/Simulating-normalizing-constants--from-importance-sampling-to-bridge-sampling/10.1214/ss/1028905934.full).

[^smc]: Pierre Del Moral, Arnaud Doucet, and Ajay Jasra, "Sequential Monte Carlo samplers", *Journal of the Royal Statistical Society: Series B* 68(3), 411-436, 2006. [PDF](https://www.stats.ox.ac.uk/~doucet/delmoral_doucet_jasra_sequentialmontecarlosamplersJRSSB.pdf); [Wiley record](https://rss.onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9868.2006.00553.x).
