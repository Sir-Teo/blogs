---
layout: post
title: "Move Two Knobs Or Miss The Model"
description: "One-at-a-time sensitivity analysis walks along coordinate axes. Sobol indices ask how much output variance each input owns, including the variance it only creates with other inputs."
date: 2026-06-16 22:56:00 -0400
categories: statistics
tags: [sensitivity-analysis, sobol-indices, variance-decomposition, monte-carlo, uncertainty-quantification, model-risk, statistics]
excerpt: "A model can look insensitive to one input until another input moves with it. Sobol indices turn that failure into a variance ledger: first-order effects, interaction effects, and total effects."
---

The most comforting sensitivity analysis is also the easiest one to fool:

```text
hold everything fixed
move one knob
watch the output
repeat
```

This is not useless. It is local debugging. It tells you whether the model
responds near a chosen baseline.

But it is not a map.

If an input only matters when another input also moves, an axis walk can report
"nothing to see here" while the model is using that input heavily. Saltelli and
Annoni make this point sharply in their critique of one-factor-at-a-time
sensitivity analysis: interactions require simultaneous movement, so OAT cannot
identify them by construction.[^saltelli-annoni]

The Sobol move is to stop asking:

```text
What happens when I move this knob from the baseline?
```

and ask:

```text
How much of the output variance is owned by this input?
How much is owned only when this input cooperates with others?
```

That is a different kind of answer.

## A Toy With Receipts

Let three independent inputs $$A,B,C$$ be uniformly distributed on $$[-1,1]$$.
Consider this deliberately transparent model:

$$
Y
=
aA+bB+cC+dAB+eBC+fAC+gABC.
$$

The terms are orthogonal under the input distribution. That gives us exact
variance receipts:

$$
\operatorname{Var}(aA)=a^2/3,
\qquad
\operatorname{Var}(dAB)=d^2/9,
\qquad
\operatorname{Var}(gABC)=g^2/27.
$$

The denominator is the total output variance:

$$
\operatorname{Var}(Y)
=
\frac{a^2+b^2+c^2}{3}
+\frac{d^2+e^2+f^2}{9}
+\frac{g^2}{27}.
$$

The first-order Sobol index for $$B$$ counts only the variance carried by the
standalone $$bB$$ term:

$$
S_B
=
\frac{\operatorname{Var}\left(\mathbb{E}[Y\mid B]\right)}
{\operatorname{Var}(Y)}
=
\frac{b^2/3}{\operatorname{Var}(Y)}.
$$

The total-effect index counts every term that contains $$B$$:

$$
S_{T_B}
=
\frac{b^2/3+d^2/9+e^2/9+g^2/27}{\operatorname{Var}(Y)}.
$$

Those two numbers can tell very different stories. First-order asks: what does
this input do alone? Total-effect asks: what variance would disappear if this
input were fixed and all its interactions were removed from play?

## The Lab

The lab below uses the exact orthogonal variance ledger and also runs a
finite-sample pick-freeze Monte Carlo estimator. The black ticks in the
first/total panel are estimates; the colored bars are truth.

With the default coefficients:

```text
Var(Y)                 1.2793
interaction share      57.3%
sum first-order        42.7%
sum total-effect       160.2%
first-order A          37.5%
first-order B           4.2%
total-effect A         90.5%
total-effect B         61.3%
OAT share for B         9.8%
pick-freeze samples     4096
MC RMSE                 2.7%
```

The red OAT bar for $$B$$ is small because the center sweep mostly sees the
standalone $$bB$$ term. The green total-effect bar is large because $$B$$ is
inside the dominant $$AB$$ interaction.

<style>
  .sobol-lab {
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

  .sobol-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin-bottom: 1rem;
  }

  .sobol-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .sobol-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .sobol-lab input {
    accent-color: #0f766e;
    width: 100%;
  }

  .sobol-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .sobol-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .sobol-lab__metric.good {
    border-color: #9ed8c5;
  }

  .sobol-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .sobol-lab__metric span,
  .sobol-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .sobol-lab__metric span {
    display: block;
  }

  .sobol-lab__metric strong {
    display: block;
    font-size: 0.96rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .sobol-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .sobol-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="sobol-sensitivity-lab" class="sobol-lab" data-sobol-sensitivity-lab>
  <div class="sobol-lab__controls">
    <label>
      Main A: <output data-value="mainA">1.20</output>
      <input type="range" min="0" max="220" step="5" value="120" data-param="mainA">
    </label>
    <label>
      Main B: <output data-value="mainB">0.40</output>
      <input type="range" min="0" max="220" step="5" value="40" data-param="mainB">
    </label>
    <label>
      Main C: <output data-value="mainC">0.20</output>
      <input type="range" min="0" max="220" step="5" value="20" data-param="mainC">
    </label>
    <label>
      A x B: <output data-value="ab">2.40</output>
      <input type="range" min="0" max="320" step="5" value="240" data-param="ab">
    </label>
    <label>
      B x C: <output data-value="bc">0.70</output>
      <input type="range" min="0" max="260" step="5" value="70" data-param="bc">
    </label>
    <label>
      A x C: <output data-value="ac">0.10</output>
      <input type="range" min="0" max="260" step="5" value="10" data-param="ac">
    </label>
    <label>
      A x B x C: <output data-value="abc">1.00</output>
      <input type="range" min="0" max="260" step="5" value="100" data-param="abc">
    </label>
    <label>
      Samples: <output data-value="samplePower">4096</output>
      <input type="range" min="7" max="13" step="1" value="12" data-param="samplePower">
    </label>
    <label>
      Seed: <output data-value="seed">53</output>
      <input type="range" min="1" max="997" step="1" value="53" data-param="seed">
    </label>
  </div>
  <div class="sobol-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="Sobol sensitivity lab showing variance components, first-order and total-effect indices, one-at-a-time blind spots, and Monte Carlo convergence"></canvas>
  <p class="sobol-lab__note">
    Deterministic browser experiment. The colored bars use the exact variance
    decomposition of the displayed polynomial. The black ticks use a Saltelli
    first-order estimator and a Jansen-style total-effect estimator from
    independent pick-freeze sample matrices.
  </p>
</div>
<script defer src="{{ '/assets/js/sobol-sensitivity-lab.js?v=20260616a' | relative_url }}"></script>

Four moves worth trying:

1. Drag **A x B** to zero. The red and green bars get closer because the
   largest interaction has been removed.
2. Drag **Main B** to zero while keeping **A x B** high. OAT nearly erases
   $$B$$, but the total-effect index still says the model needs $$B$$.
3. Lower **Samples** to 128. The Monte Carlo ticks wander. This is not a bug in
   Sobol indices; it is estimator noise.
4. Set all interaction sliders to zero. The first-order and total-effect bars
   match, and both sets sum to 100%.

## Why Totals Can Sum Above 100%

First-order Sobol indices partition variance into standalone effects:

$$
S_i=\frac{\operatorname{Var}(\mathbb{E}[Y\mid X_i])}{\operatorname{Var}(Y)}.
$$

Their sum is at most one when the inputs are independent. The missing mass is
interaction variance.

Total-effect indices answer a different question:

$$
S_{T_i}
=
1-\frac{\operatorname{Var}(\mathbb{E}[Y\mid X_{\sim i}])}{\operatorname{Var}(Y)}.
$$

They count every variance component containing $$X_i$$. An $$AB$$ interaction is
therefore charged to both $$A$$ and $$B$$. That double-counting is not a flaw. It
is the point. If fixing either $$A$$ or $$B$$ kills the interaction, both inputs
are necessary for that piece of variance.

So the useful reading is:

```text
first-order: what the input explains alone
total-effect: what disappears if the input is fixed
gap: interaction dependence
```

The default lab has first-order sum 42.7% and total-effect sum 160.2%. That is
not arithmetic confusion. It is the model announcing that more than half of its
variance lives in cooperation terms.

## What The Pick-Freeze Trick Buys

Sobol's original global sensitivity framework connects these indices to a
variance decomposition of the model output.[^sobol] Saltelli's 2002 paper makes
the computational story practical: two sample matrices can be recombined so that
one column is frozen or swapped while the others move.[^saltelli2002]

The lab uses that idea.

Let $$A$$ and $$B$$ be two independent input matrices. To estimate the total
effect of the first input, form a hybrid matrix whose rows come from $$A$$
except that column 1 is borrowed from $$B$$. If changing only column 1 often
changes the output, input 1 has large total effect. If the output barely moves,
input 1 can be fixed with little variance loss.

The estimate is not magic. Small indices are hard to estimate. Owen's work on
small Sobol indices is a good reminder that estimator choice matters, especially
when the numerator is tiny.[^owen] The lab's sample-size slider is there because
a sensitivity report without uncertainty is only a bar chart with confidence.

## The Model Audit I Want

When a team hands me a sensitivity analysis, I want to know five things.

First, what distribution over inputs did the analysis use? Sobol indices are
about variance under an input distribution. Change the distribution, change the
denominator.

Second, are the inputs independent? The classical Sobol-Hoeffding decomposition
relies on independence for clean orthogonal variance allocation. Correlated
inputs need extra care; otherwise "importance" can become a property of the
coordinate system rather than the model.

Third, are first-order and total-effect indices both reported? First without
total misses interactions. Total without first cannot tell whether an input
acts alone or only through others.

Fourth, is the estimator noise visible? If the Monte Carlo design is small, the
ordering of weak inputs can be noise. Bootstrap intervals, repeated designs, or
quasi-Monte Carlo can make the uncertainty harder to ignore.

Fifth, did anyone still do local OAT? Good. Keep it. Local sweeps are excellent
for debugging, unit sanity, and finding singular regions. Just do not mistake an
axis walk for the geography of the model.

## Paper Trail

[^sobol]: I. M. Sobol, ["Sensitivity Estimates for Nonlinear Mathematical Models"](https://www.andreasaltelli.eu/file/repository/sobol1993.pdf), *Mathematical Modelling and Computational Experiments*, 1993.

[^saltelli2002]: Andrea Saltelli, ["Making best use of model evaluations to compute sensitivity indices"](https://www.andreasaltelli.eu/file/repository/Making_best_use.pdf), *Computer Physics Communications*, 2002. The paper states the first-order index as $$S_j=\operatorname{Var}(\mathbb{E}[Y\mid x_j])/\operatorname{Var}(Y)$$ and discusses recombining sample matrices for efficient estimation.

[^saltelli-annoni]: Andrea Saltelli and Paola Annoni, ["How to avoid a perfunctory sensitivity analysis"](https://www.nusap.net/spe/Saltelli_and_Annoni_2010.pdf), *Environmental Modelling & Software*, 2010. DOI: [10.1016/j.envsoft.2010.04.012](https://doi.org/10.1016/j.envsoft.2010.04.012).

[^owen]: Art B. Owen, ["Better estimation of small Sobol' sensitivity indices"](https://artowen.su.domains/reports/newsobol-forweb.pdf), *ACM Transactions on Modeling and Computer Simulation*, 2013. DOI: [10.1145/2457459.2457460](https://doi.org/10.1145/2457459.2457460).
