---
layout: post
title: "Which Zero-Error Model Did You Get?"
description: "Double descent is not a moral boundary between underfitting and overfitting. It is a clue that geometry, noise, and implicit regularization selected one interpolator among many."
date: 2026-06-13 01:05:00 -0400
categories: machine-learning
tags: [double-descent, benign-overfitting, interpolation, random-features, statistics]
excerpt: "Modern models can fit the training set exactly and still generalize. The useful question starts afterward: which interpolating function did training choose?"
---

The old story says model complexity is a dial with a warning sticker. Turn it too low and the model
underfits. Turn it too high and the model overfits. Somewhere in the middle is
the sweet spot.

That story is not wrong. It is incomplete.

Modern machine learning lives in a stranger regime. Large neural networks often
have enough parameters to fit the training data exactly, even when labels are
noisy. Zhang, Bengio, Hardt, Recht, and Vinyals made the discomfort explicit:
standard networks can fit random labels, yet similar architectures generalize
well on real tasks.[^zhang] Belkin, Hsu, Ma, and Mandal proposed a unifying
picture: test error can follow a double-descent curve, first behaving like the
classical U-shape, then peaking near the interpolation threshold, then falling
again as capacity continues to grow.[^belkin]

<div class="callout">
  <strong>Thesis:</strong> interpolation is not the end of generalization. It is
  the beginning of a selection problem. Once many functions fit the data exactly,
  the important question is which interpolator the algorithm's geometry and
  implicit regularization choose.
</div>

This matters because "the model has more parameters than examples" is too crude
to be a theory. It tells us interpolation is possible. It does not tell us
whether the interpolating solution is jagged, lucky, minimum-norm, stable,
aligned with the signal, or mostly hiding noise in directions that do not matter
for prediction.

## The Cliff at Exact Fit

In least squares, the interpolation threshold appears when the number of
effective features is close to the number of training examples. Below the
threshold, the model cannot generally fit arbitrary labels. Near the threshold,
the fitted solution can become unstable because it is trying to satisfy many
constraints with just enough degrees of freedom.

Above the threshold, there are many exact fits. Ordinary least squares is no
longer unique. A training algorithm must choose among the interpolators. The
minimum-norm interpolator is one important choice:

$$
\widehat{w}
=
\arg\min_w \|w\|_2
\quad
\text{subject to}
\quad
Xw = y.
$$

Hastie, Montanari, Rosset, and Tibshirani analyze high-dimensional ridgeless
least-squares interpolation and recover double-descent behavior in a precise
quantitative setting.[^hastie] Mei and Montanari show the same kind of curve in
random-features regression, an analytically tractable model that resembles a
two-layer network with random first-layer weights.[^mei]

The key lesson is not "bigger is always better." The lesson is that the
overparameterized side has its own bias-variance bookkeeping.

## Benign Still Has Conditions

Benign overfitting is the surprising case where a model fits noisy training data
exactly and still predicts well. Bartlett, Long, Lugosi, and Tsigler characterize
when minimum-norm linear regression can interpolate and generalize, with the
answer depending on the covariance spectrum and effective ranks.[^bartlett]
Muthukumar, Vodrahalli, Subramanian, and Sahai study harmless interpolation of
noisy data and show why overparameterization can sometimes help noise get
absorbed in directions that do little predictive damage.[^muthukumar]

The word benign is easy to misuse. It does not mean noise disappeared. It means
the fitted noise lives in parts of the feature space that contribute little to
test risk. Change the spectrum, the signal, the noise, the optimizer, or the
regularization, and the same interpolation can become harmful.

There are at least three moving parts:

1. The signal: which directions contain the real function.
2. The noise: how much arbitrary variation must be interpolated.
3. The geometry: which directions the algorithm prefers when many fits exist.

Double descent is what happens when these parts are summarized by a single
complexity axis.

## Complexity Is a Moving Target

Nakkiran et al. argue that double descent should be understood through effective
model complexity, not just raw parameter count. They show model-wise, epoch-wise,
and sample-wise double descent in deep learning settings.[^nakkiran] A model can
become effectively more complex because it has more parameters, trains longer,
or fits the data more tightly.

This is why the same architecture can behave differently under weight decay,
early stopping, data augmentation, label noise, optimizer choice, or feature
preprocessing. These choices change which interpolator is selected.

Belkin's later "fit without fear" survey frames interpolation and
overparameterization as a prism for modern learning theory, not a full theory by
itself.[^fit] That phrasing is useful. Interpolation separates the question of
fitting from the question of selection. Deep learning still has all the hard
parts: representation learning, optimization dynamics, data structure, and
distribution shift.

## Interpolator Lab

The simulator below fits random-feature ridge regressions to a noisy
one-dimensional function. The x-axis is the number of random features. Around the
training-set size, the system crosses the interpolation threshold. The
ridgeless solution uses a tiny numerical ridge and the minimum-norm solution
when the system is overparameterized.

You can change sample size, label noise, ridge strength, feature scale, and test
shift. The model is small enough to run in the browser, but real enough to solve
linear systems for every point on the curve.

<div class="double-descent-lab" data-double-descent-lab>
  <div class="double-descent-lab__controls">
    <label>
      Training rows: <output data-value="rows">64</output>
      <input type="range" min="24" max="120" step="4" value="64" data-param="rows">
    </label>
    <label>
      Label noise: <output data-value="noise">18%</output>
      <input type="range" min="0" max="55" value="18" data-param="noise">
    </label>
    <label>
      Ridge strength: <output data-value="ridge">1e-6</output>
      <input type="range" min="0" max="80" value="10" data-param="ridge">
    </label>
    <label>
      Feature scale: <output data-value="scale">1.0</output>
      <input type="range" min="20" max="220" value="100" data-param="scale">
    </label>
    <label>
      Signal wiggle: <output data-value="wiggle">55%</output>
      <input type="range" min="0" max="100" value="55" data-param="wiggle">
    </label>
    <label>
      Test shift: <output data-value="shift">0.00</output>
      <input type="range" min="-50" max="50" value="0" data-param="shift">
    </label>
  </div>
  <div class="double-descent-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="430" aria-label="Double descent simulation over random feature counts"></canvas>
  <div class="double-descent-lab__legend">
    <span><i style="background:#0f766e"></i> Test MSE</span>
    <span><i style="background:#b45309"></i> Training MSE</span>
    <span><i style="background:#2563eb"></i> Interpolation threshold</span>
    <span><i style="background:#7c3aed"></i> Weight norm</span>
  </div>
  <p class="double-descent-lab__note">
    Deterministic simulation. Random Fourier features are fixed by the current
    controls; each point refits ridge or near-ridgeless regression from scratch.
  </p>
</div>
<script defer src="{{ '/assets/js/double-descent-lab.js' | relative_url }}"></script>

Try raising label noise. The interpolation peak grows because the model is
forced to fit arbitrary variation. Now increase ridge strength. The peak softens
because the system no longer insists on an exact, high-norm fit. Increase the
feature scale. The random features become more oscillatory, which changes both
the signal approximation and the cost of fitting noise.

The most interesting movement happens past the threshold. More features can
reduce test error even after training error is nearly zero, because the
minimum-norm interpolator changes. The model is not "memorizing less." It is choosing a
different exact fit.

## Things to Log Besides Width

If I were diagnosing double descent in a real system, I would not only plot
accuracy against parameter count. I would also log:

- train loss, test loss, and calibration;
- effective rank or spectrum of learned representations;
- optimizer, training time, weight decay, and early stopping;
- label noise and data augmentation strength;
- norm or margin of the selected solution;
- sensitivity to sample size and random seed;
- performance under distribution shift, not only in-distribution test error.

The interpolation threshold is a useful landmark. It is not a deployment
guarantee.

## Make the Selector Visible

The practical research frontier is to make implicit regularization legible.

Deep learning practitioners already use a bundle of selection mechanisms:
architecture, initialization, stochastic gradient descent, normalization, weight
decay, dropout, data augmentation, early stopping, scale, and pretraining. These
choices decide which solution appears among many that fit the training data.
The theory is catching up by studying minimum-norm interpolation, random
features, kernel limits, margin, spectra, and optimization dynamics.

The operational version is simple:

- do not ask only whether a model interpolates;
- ask what family of interpolators the training procedure makes accessible;
- measure how noisy labels and rare subgroups are fit;
- regularize the selector, not merely the parameter count;
- treat the overparameterized regime as a design space, not a forbidden zone.

Double descent is not a license to ignore overfitting. It is a warning that the
old vocabulary was too small. In modern ML, "fits the training data" is a weak
description. The real sentence begins after it: fits the training data how?

## Sources

[^zhang]: Chiyuan Zhang, Samy Bengio, Moritz Hardt, Benjamin Recht, and Oriol Vinyals, "Understanding deep learning requires rethinking generalization," ICLR 2017. [arXiv](https://arxiv.org/abs/1611.03530).

[^belkin]: Mikhail Belkin, Daniel Hsu, Siyuan Ma, and Soumik Mandal, "Reconciling modern machine-learning practice and the classical bias-variance trade-off," *PNAS*, 2019. [PNAS](https://www.pnas.org/doi/10.1073/pnas.1903070116).

[^hastie]: Trevor Hastie, Andrea Montanari, Saharon Rosset, and Ryan J. Tibshirani, "Surprises in High-Dimensional Ridgeless Least Squares Interpolation," *Annals of Statistics*, 2022. [arXiv](https://arxiv.org/abs/1903.08560).

[^mei]: Song Mei and Andrea Montanari, "The generalization error of random features regression: Precise asymptotics and double descent curve," *Communications on Pure and Applied Mathematics*, 2022. [arXiv](https://arxiv.org/abs/1908.05355).

[^bartlett]: Peter L. Bartlett, Philip M. Long, Gabor Lugosi, and Alexander Tsigler, "Benign overfitting in linear regression," *PNAS*, 2020. [PNAS](https://www.pnas.org/doi/10.1073/pnas.1907378117).

[^muthukumar]: Vidya Muthukumar, Kailas Vodrahalli, Vignesh Subramanian, and Anant Sahai, "Harmless interpolation of noisy data in regression," IEEE Journal on Selected Areas in Information Theory, 2020. [arXiv](https://arxiv.org/abs/1903.09139).

[^nakkiran]: Preetum Nakkiran, Gal Kaplun, Yamini Bansal, Tristan Yang, Boaz Barak, and Ilya Sutskever, "Deep Double Descent: Where Bigger Models and More Data Hurt," ICLR 2020. [arXiv](https://arxiv.org/abs/1912.02292).

[^fit]: Mikhail Belkin, "Fit without fear: remarkable mathematical phenomena of deep learning through the prism of interpolation," *Acta Numerica*, 2021. [arXiv](https://arxiv.org/abs/2105.14368).
