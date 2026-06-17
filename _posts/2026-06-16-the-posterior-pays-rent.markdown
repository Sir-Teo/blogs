---
layout: post
title: "The Posterior Pays Rent"
description: "PAC-Bayes bounds let the learned distribution depend on the data, but charge it KL divergence from a data-independent prior."
date: 2026-06-16 20:31:00 -0400
categories: machine-learning
tags: [pac-bayes, generalization, kl-divergence, learning-theory, stochastic-classifiers, bounds, machine-learning]
excerpt: "PAC-Bayes is not a sermon about believing your prior. It is a receipt: if the posterior moves after seeing the data, the generalization bound charges KL rent."
---

Generalization bounds often sound like weather reports from another planet.

The model has too many parameters. The VC dimension is huge. The worst-case
bound says the classifier may do anything at all. Meanwhile the test error is
fine, the product ships, and everyone politely stops looking at the theorem.

PAC-Bayes is one of the cleaner attempts to repair that conversation.

It does not ask how many classifiers exist in the hypothesis class in the
abstract. It asks a more local question:

```text
how far did the learned distribution move from a prior you committed to before
seeing this sample?
```

That distance is measured by KL divergence. The posterior is allowed to depend
on the data. It just has to pay rent.

## The Bound Has A Ledger

Let $$P$$ be a data-independent prior distribution over classifiers. After
seeing a training sample $$S$$ of size $$n$$, choose any posterior distribution
$$Q$$ over classifiers. The Gibbs classifier draws $$h \sim Q$$ and predicts
with that sampled classifier.

Write

$$
\widehat L_S(Q)=\mathbb E_{h\sim Q}\widehat L_S(h)
$$

for the empirical Gibbs risk, and

$$
L_{\mathcal D}(Q)=\mathbb E_{h\sim Q}L_{\mathcal D}(h)
$$

for the population Gibbs risk.

One common PAC-Bayes-kl form says that, with probability at least
$$1-\delta$$ over the draw of the sample, the following inequality holds
simultaneously for all posteriors $$Q$$:

$$
\operatorname{kl}\!\left(\widehat L_S(Q)\,\middle\|\,L_{\mathcal D}(Q)\right)
\le
\frac{\mathrm{KL}(Q\|P)+\log(2\sqrt n/\delta)}{n}.
$$

Here $$\operatorname{kl}(q\|p)$$ is the binary relative entropy between two
Bernoulli rates. The lab below numerically inverts this inequality: given the
empirical risk and the right-hand side, it solves for an upper bound on the
unknown population risk.

The shape of the theorem is the point:

```text
empirical fit + posterior movement + confidence price -> risk receipt
```

This is not the same as saying "Bayesian posteriors generalize because Bayes."
PAC-Bayes is more flexible and more severe. The posterior can be any
data-dependent distribution, even one produced by an optimizer. The prior can
be any distribution that did not peek at the sample. The bill is
$$\mathrm{KL}(Q\|P)$$.

McAllester's late-1990s PAC-Bayes papers made this form of model averaging a
central learning-theory object.[^mcallester] Langford and Seeger sharpened the
averaging-classifier view and the kl-style bound used here.[^langford-seeger]
Catoni later developed the thermodynamic language that makes the Gibbs
posterior feel less like notation and more like an energy tradeoff.[^catoni]

## A Little Posterior Economy

The lab uses a deliberately small world. There is a two-dimensional binary
classification task with a hidden linear boundary and controllable label noise.
The hypothesis class is a grid of linear threshold classifiers. The prior is a
distribution over boundary angle and threshold offset. The posterior is a Gibbs
distribution:

$$
Q_\beta(h)
\propto
P(h)\exp\{-\beta n\widehat L_S(h)\}.
$$

The knob $$\beta$$ is called **posterior pressure** below. At $$\beta=0$$, the
posterior is just the prior. As $$\beta$$ rises, the posterior spends more KL
to concentrate on classifiers with lower empirical error.

<style>
  .pac-lab {
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

  .pac-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .pac-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .pac-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .pac-lab input {
    accent-color: #7c3aed;
    width: 100%;
  }

  .pac-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .pac-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .pac-lab__metric span,
  .pac-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .pac-lab__metric span {
    display: block;
  }

  .pac-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .pac-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .pac-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="pac-bayes-lab" class="pac-lab" data-pac-bayes-lab>
  <div class="pac-lab__controls">
    <label>
      Examples: <output data-value="n">90</output>
      <input type="range" min="24" max="260" step="2" value="90" data-param="n">
    </label>
    <label>
      Label noise: <output data-value="noisePct">10%</output>
      <input type="range" min="0" max="35" step="1" value="10" data-param="noisePct">
    </label>
    <label>
      Posterior pressure: <output data-value="temperature">1.05</output>
      <input type="range" min="0" max="120" step="1" value="42" data-param="temperature">
    </label>
    <label>
      Prior angle: <output data-value="priorAngle">20 deg</output>
      <input type="range" min="0" max="179" step="1" value="20" data-param="priorAngle">
    </label>
    <label>
      Prior spread: <output data-value="priorSpread">42 deg</output>
      <input type="range" min="8" max="90" step="1" value="42" data-param="priorSpread">
    </label>
    <label>
      Delta: <output data-value="deltaPct">5%</output>
      <input type="range" min="1" max="20" step="1" value="5" data-param="deltaPct">
    </label>
    <label>
      Seed: <output data-value="seed">29</output>
      <input type="range" min="1" max="997" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="pac-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="760" aria-label="PAC-Bayes lab showing posterior vote, risk curves, posterior mass, KL divergence, and generalization bound"></canvas>
  <p class="pac-lab__note">
    Deterministic browser experiment. The population risk is approximated on a
    dense grid under the same label-noise rate. The PAC-Bayes number is the
    kl-inverted upper bound for the Gibbs classifier, not a bound for the
    deterministic majority vote.
  </p>
</div>
<script defer src="{{ '/assets/js/pac-bayes-lab.js?v=20260616a' | relative_url }}"></script>

On the default run, the lab's audit reports a grid of `2993` classifiers. The
posterior pressure is $$\beta\approx 1.05$$. The empirical Gibbs risk is about
`9.6%`; the estimated population Gibbs risk is about `12.3%`; the PAC-Bayes
upper bound is about `29.7%`; and the posterior spends about `4.8` nats of KL.

That may sound loose if you are thinking like a Kaggle leaderboard. It is not
loose in the way a vacuous bound is loose. It is not saying "the error could be
100%." It is a finite-sample, data-dependent certificate for a stochastic
classifier chosen after looking at the labels.

Now move **Posterior pressure** to zero. The posterior returns to the prior.
The KL term collapses, but the empirical risk is bad because the prior is
spread over many boundaries, most of which are not useful. The receipt is
cheap because the posterior did not learn much.

Raise **Posterior pressure**. Empirical risk falls fast. KL rises. The bound
usually improves at first, then stops improving, because the posterior has
already concentrated on a small set of classifiers. Pushing harder mostly buys
a little more training fit with more KL rent.

That is the first lesson:

```text
low training error is not free evidence
```

It becomes evidence only after paying for how specifically the posterior moved.

## A Prior Is A Pre-Registered Compression Scheme

The prior in the lab is deliberately visible. It has a center angle and a
spread. The true hidden boundary is near `35 deg`. The default prior center is
`20 deg`, close enough to be useful but not clairvoyant.

Move **Prior angle** toward the true boundary and reduce **Prior spread**. If
the prior was chosen before seeing this sample, the posterior needs less KL to
find good classifiers, and the bound tightens. Move the prior to the wrong
side and make it narrow. The posterior can still fit the training set, but it
must spend a lot of KL to escape the prior's wrong bet.

This is the right way to read the prior:

```text
not belief as poetry, but compression as a promise
```

If a prior gives high probability to the kind of classifier the data later
selects, the selected posterior is cheap to describe relative to that prior. If
the prior puts little mass there, the posterior has to send more information.

This is also why the prior has to be data-independent. If you tune the prior
after inspecting the same labels, the receipt is fake. There are valid ways to
use data-dependent priors, localization, sample splitting, or hierarchical
constructions, but then the dependence has to be accounted for. The lab keeps
the contract simple: one prior, then one sample, then one posterior.

## The Stochastic Classifier Is Not A Footnote

The bound in the lab is for the Gibbs classifier:

```text
draw h from Q, then predict with h
```

The deterministic majority vote of the posterior often has lower risk in this
toy problem. The metric tile shows it because practitioners naturally care
about the vote. But the displayed PAC-Bayes upper bound is not automatically a
bound on that vote classifier. There are PAC-Bayesian analyses of majority
votes, margins, and C-bounds, but they are different statements.

This distinction matters. Many generalization claims smuggle in a change of
object:

1. prove something about a randomized predictor;
2. deploy a deterministic predictor;
3. talk as if the certificate followed unchanged.

Sometimes the gap can be closed. Sometimes the stochastic object is the thing
you should actually certify. Either way, the object under the theorem should
match the object under deployment.

Langford and Caruana's old neural-network paper made this move explicit by
bounding a distribution over networks produced by a sensitivity analysis, not
the single deterministic network in isolation.[^langford-caruana] Dziugaite and
Roy later revived the same spirit for modern stochastic neural networks,
optimizing PAC-Bayes bounds directly and obtaining nonvacuous numerical bounds
in settings where parameter-count arguments are hopelessly pessimistic.[^dziugaite-roy]

The philosophical shift is subtle:

```text
do not certify the point estimate if the neighborhood is what you can afford
to describe
```

Flatness, noise stability, posterior spread, compression, and perturbation
sensitivity all become different languages for the same practical question:
how much information did learning have to extract from the sample?

## Sample Size Buys Two Things

Increase **Examples**.

The first effect is ordinary: the empirical risk becomes a better estimate of
the population risk. The second is specific to the receipt:

$$
\frac{\mathrm{KL}(Q\|P)+\log(2\sqrt n/\delta)}{n}
$$

gets smaller when the same posterior movement is amortized over more examples.
A KL cost of five nats is expensive at `n=25` and modest at `n=250`.

This is a nice antidote to an overly simple slogan:

```text
more data is not only more observations; it is more budget for adaptation
```

With more data, the posterior can afford to move farther while keeping the
same per-example receipt. Or it can move the same distance and receive a
tighter bound.

Now raise **Label noise**. The empirical and true risks cannot both go to zero
because the labels themselves contain irreducible corruption. High posterior
pressure can still chase accidental label flips in the finite sample. The KL
bill notices the concentration, but it does not know which labels were flipped.
PAC-Bayes is not a magic detector of data quality. It is an accounting system
for posterior movement under bounded loss.

## What I Would Want In A Real Bound Report

If a paper or internal model card claims a PAC-Bayes certificate, I would want
the report to include the boring pieces.

- The exact stochastic predictor being certified.
- The prior and why it was data-independent.
- Any data used to tune the prior, localization, or hyperparameters.
- The empirical loss used in the theorem, not only the deployed metric.
- The KL term in nats or bits.
- The confidence parameter $$\delta$$.
- The numerical method used to invert the binary-kl inequality.
- A sweep over posterior scale, noise scale, or compression level.
- A comparison between the certified stochastic predictor and the deployed
  deterministic predictor.

The important plot is not just test error versus train error. It is the
three-line ledger:

```text
empirical risk
population estimate
certified upper bound
```

with KL printed in the margin.

This is where PAC-Bayes feels modern. The theorem does not pretend that the
training algorithm never looked at the data. It says: look all you want, but
bring a receipt for how far the resulting distribution moved from the prior.

That receipt can be loose. It can be hard to optimize. It can certify a
stochastic predictor when the production system wants a deterministic one. It
can be made meaningless by a prior that secretly saw the data. It is not a
one-line explanation for deep learning.

But it does something rare for a generalization bound:

```text
it lets the learned object be local
```

The posterior is not charged for every classifier the model class could have
represented. It is charged for the distribution it actually uses, relative to a
prior chosen before the sample.

That is why I like the rent metaphor. You can live in a small neighborhood of a
huge city. The bound does not charge you rent for the whole city. It charges
you for the address you chose and how surprising that address was under the
lease you signed before seeing the data.

The posterior pays rent. Generalization is what remains after the bill clears.

## Paper Trail

[^mcallester]: David A. McAllester, ["PAC-Bayesian Model Averaging"](https://dl.acm.org/doi/10.1145/307400.307435), *COLT*, 1999. See also McAllester's [PAC-Bayes bibliography page](https://home.ttic.edu/~dmcallester/PAC-Bayes.html).

[^langford-seeger]: John Langford and Matthias Seeger, ["Bounds for Averaging Classifiers"](https://www.cs.cmu.edu/~jcl/papers/averaging/averaging_tech.pdf), CMU technical report CMU-CS-01-102, 2001.

[^catoni]: Olivier Catoni, ["PAC-Bayesian Supervised Classification: The Thermodynamics of Statistical Learning"](https://projecteuclid.org/ebooks/institute-of-mathematical-statistics-lecture-notes-monograph-series/Pac-Bayesian-Supervised-Classification/toc/10.1214/074921707000000391), IMS Lecture Notes Monograph Series, 2007. Author arXiv version: [0712.0248](https://arxiv.org/abs/0712.0248).

[^langford-caruana]: John Langford and Rich Caruana, ["(Not) Bounding the True Error"](https://papers.nips.cc/paper/1968-not-bounding-the-true-error), *NeurIPS*, 2001. Author PDF: [CMU](https://www.cs.cmu.edu/~jcl/papers/nn_bound/not_bound.pdf).

[^dziugaite-roy]: Gintare Karolina Dziugaite and Daniel M. Roy, ["Computing Nonvacuous Generalization Bounds for Deep (Stochastic) Neural Networks with Many More Parameters than Training Data"](https://arxiv.org/abs/1703.11008), *UAI*, 2017. Proceedings PDF: [AUAI](https://www.auai.org/uai2017/proceedings/papers/173.pdf).
