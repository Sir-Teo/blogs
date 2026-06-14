---
layout: post
title: "Random Noise Can Draw a Ball"
description: "Randomized smoothing turns a classifier into a Gaussian vote. If the vote gap is large enough, the prediction comes with a certified L2 ball."
date: 2026-06-14 12:10:00 -0400
categories: machine-learning
tags: [randomized-smoothing, adversarial-robustness, certified-robustness, gaussian-noise, adversarial-examples, machine-learning]
excerpt: "A smoothed classifier is not robust because noise is magic. It is robust when the probability gap between the top classes is large enough to survive every perturbation inside an L2 ball."
---

Adversarial robustness is usually told as a fight.

The attacker chooses a small perturbation. The model changes its mind. The
defender patches the training procedure. The attacker adapts.

Randomized smoothing changes the tone of the story. It does not ask whether an
attack has been found. It asks for a certificate:

```text
inside this ball, the prediction cannot change
```

That is a different kind of claim. It is local, probabilistic, and geometric.
It does not say the classifier is globally safe. It does not say the base model
is wise. It says that, around one input, a particular Gaussian vote has enough
probability margin to certify an $$\ell_2$$ radius.

The object being certified is not the original classifier $$f$$. It is the
smoothed classifier

$$
g(x)
=
\arg\max_c
P(f(x + \epsilon)=c),
\quad
\epsilon \sim \mathcal{N}(0,\sigma^2 I).
$$

Run the base classifier on many noisy copies of the same input. Count the votes.
If class $$A$$ wins by enough, the smoothed classifier predicts $$A$$.

The remarkable part is that the vote gap can become a radius.

## The Formula

Suppose the top class has probability $$p_A$$ under Gaussian noise, and the
runner-up has probability $$p_B$$. Cohen, Rosenfeld, and Kolter proved a tight
$$\ell_2$$ robustness guarantee for Gaussian randomized smoothing:[^cohen]

$$
R
=
\frac{\sigma}{2}
\left(
\Phi^{-1}(p_A) - \Phi^{-1}(p_B)
\right),
$$

where $$\Phi^{-1}$$ is the inverse standard normal CDF.

For binary classification, $$p_B = 1-p_A$$, so this simplifies to

$$
R = \sigma \Phi^{-1}(p_A).
$$

If the smoothed classifier says class $$A$$ and $$\|\delta\|_2 < R$$, then the
smoothed classifier also says class $$A$$ at $$x+\delta$$.

The theorem is not about gradients. It is not about a particular attack. It is
about how much a Gaussian measure can shift when its center moves. The proof
uses a Neyman-Pearson style argument: among all regions with a given Gaussian
mass, halfspaces are the worst case for losing mass under a shift. If class
$$A$$ owns enough probability mass at $$x$$, then no perturbation smaller than
the radius can make some other class overtake it.

That is the core shape:

```text
large noisy vote gap -> certified L2 ball
```

The catch is that in real models we do not know $$p_A$$ exactly. We estimate it
with Monte Carlo samples and certify from a lower confidence bound, not from the
raw vote fraction. The lab below does the same thing. It uses a 99% Wilson lower
bound for the top-class vote before converting the vote to a radius. That is
still a toy certificate, but it avoids pretending that 768 noisy votes are an
oracle.

## A Small Smoothing Lab

The base classifier in the lab is deliberately ugly: a two-dimensional decision
boundary with high-frequency wiggles. The smoothed classifier votes by adding
Gaussian noise around the red point. The orange circle is the conservative
certificate radius. The dashed red circle is a brute-force search for the
nearest smoothed-boundary flip that the lab could find.

<style>
  .smooth-lab {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    margin: 1.5rem 0;
    padding: 1rem;
    background: #ffffff;
  }

  .smooth-lab__controls {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .smooth-lab__controls label {
    color: #172026;
    display: grid;
    font-size: 0.85rem;
    font-weight: 700;
    gap: 0.35rem;
  }

  .smooth-lab__controls output {
    color: #0f766e;
    font-variant-numeric: tabular-nums;
  }

  .smooth-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .smooth-lab__metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0.2rem 0 0.9rem;
  }

  .smooth-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    padding: 0.62rem 0.7rem;
  }

  .smooth-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .smooth-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }

  .smooth-lab canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    display: block;
    width: 100%;
  }

  .smooth-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }

  .smooth-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .smooth-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .smooth-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 900px) {
    .smooth-lab__controls,
    .smooth-lab__metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .smooth-lab {
      margin-left: calc(50% - 50vw + 1rem);
      margin-right: calc(50% - 50vw + 1rem);
    }

    .smooth-lab__controls,
    .smooth-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .smooth-lab__controls,
    .smooth-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="smooth-lab" data-randomized-smoothing-lab>
  <div class="smooth-lab__controls">
    <label>
      Noise sigma <output data-value="sigma">0.45</output>
      <input type="range" min="5" max="120" step="5" value="45" data-param="sigma">
    </label>
    <label>
      Boundary wiggle <output data-value="wiggle">0.65</output>
      <input type="range" min="0" max="120" step="5" value="65" data-param="wiggle">
    </label>
    <label>
      Wiggle frequency <output data-value="frequency">6</output>
      <input type="range" min="1" max="12" step="1" value="6" data-param="frequency">
    </label>
    <label>
      Vote samples <output data-value="samples">768</output>
      <input type="range" min="128" max="2048" step="128" value="768" data-param="samples">
    </label>
    <label>
      Point x <output data-value="px">0.50</output>
      <input type="range" min="-120" max="120" step="1" value="25" data-param="px">
    </label>
    <label>
      Point y <output data-value="py">0.36</output>
      <input type="range" min="-120" max="120" step="1" value="18" data-param="py">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input type="range" min="1" max="999" step="1" value="31" data-param="seed">
    </label>
  </div>
  <div class="smooth-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Randomized smoothing lab showing a base classifier, a smoothed classifier, certificate radius, and nearest found boundary flip"></canvas>
  <div class="smooth-lab__legend">
    <span><i style="background:#2563eb"></i> Blue class</span>
    <span><i style="background:#0f766e"></i> Green class</span>
    <span><i style="background:#be123c"></i> Test point / found flip</span>
    <span><i style="background:#d97706"></i> Conservative certificate</span>
  </div>
  <p class="smooth-lab__note">
    Deterministic synthetic experiment. The smoothed probability is estimated
    with Gaussian votes. The displayed radius uses a 99% Wilson lower bound on
    the top vote before applying the binary randomized-smoothing formula.
  </p>
</div>

<script defer src="{{ '/assets/js/randomized-smoothing-lab.js?v=20260614b' | relative_url }}"></script>

With the default settings, the raw top-class vote is about `59.4%`. The 99%
lower-bound vote is about `54.7%`, so the displayed radius is only `0.054`
instead of the ideal-formula radius `0.107` you would get by pretending the raw
Monte Carlo vote were exact. A brute-force search finds the nearest smoothed
boundary around `0.162`, outside the conservative certificate.

That gap is the healthy shape:

```text
conservative certificate < searched boundary
```

Try increasing **Noise sigma**. The boundary gets smoother, but the top vote can
also fall toward `50%`. A larger noise scale does not automatically give a
larger certificate. The formula multiplies by $$\sigma$$, but it also asks
whether the noisy vote still has a margin.

Try increasing **Boundary wiggle** or **Wiggle frequency**. The base classifier
becomes more brittle. Smoothing can wash out small wiggles, but if the red point
is near a folded region, the vote gap shrinks and the certified radius collapses.

This is the essential trade:

```text
noise removes small brittle features
noise also asks the classifier to be right under corrupted inputs
```

## What the Certificate Is Not

The first adversarial-example papers made the vulnerability feel almost
paradoxical: imperceptible perturbations could flip the prediction of high
performing neural networks.[^szegedy] Goodfellow, Shlens, and Szegedy argued
that high-dimensional linear behavior is enough to explain much of the
phenomenon and introduced the fast gradient sign method as a simple attack
construction.[^goodfellow]

Randomized smoothing does not make that history go away. It changes the claim.

It does not certify the base classifier $$f$$. The base classifier in the lab
still has tiny folds. The certificate belongs to $$g$$, the classifier that
votes over Gaussian perturbations.

It does not certify every input. If the noisy vote is close to `50%`, the radius
is zero or tiny. Smoothing can abstain in practice by refusing to certify when
the vote is too uncertain.

It does not prove semantic robustness. An $$\ell_2$$ ball is a mathematical
threat model. Whether that ball matches the perceptual, physical, or product
risk depends on the domain.

And it does not let us ignore estimation. Cohen et al.'s practical certification
procedure samples the base classifier many times and uses statistical confidence
bounds for class probabilities.[^cohen] The theorem needs probabilities; code
gets counts.

## Why This Scaled

PixelDP had already drawn a connection between randomized mechanisms,
differential privacy, and adversarial robustness certificates.[^pixeldp] The
Cohen-Rosenfeld-Kolter result became especially influential because Gaussian
smoothing gave a tight $$\ell_2$$ certificate and could wrap arbitrary base
classifiers.

That wrapper property matters. You can train a large classifier to be accurate
under Gaussian noise, then certify the smoothed version. Salman et al. improved
the empirical side by adversarially training smoothed classifiers, showing that
training for the smoothed objective can materially improve certified
accuracy.[^salman]

The later literature also generalizes the geometry. Gaussian smoothing is tied
to $$\ell_2$$ balls. Other smoothing distributions can certify other shapes,
but the analysis is not free. Yang et al.'s "all shapes and sizes" work is a
good example of asking what randomized smoothing can and cannot certify under
other norms.[^yang]

The lab stays in two dimensions because the geometry is visible. The same
pressure exists in images, embeddings, sensor vectors, and tabular models:

```text
to certify a region, the noisy vote must dominate throughout the region
```

## The Useful Mental Model

I find randomized smoothing easiest to remember as a polling place.

The base classifier is not asked once. It is asked many times under nearby
Gaussian worlds. If one class wins by a large enough margin, moving the polling
center a little cannot make the other class win. The certified ball is the set
of centers for which the winner is mathematically locked in.

The certificate is beautiful because it is attack-independent.

It is limited because it is vote-dependent.

That tension is the whole subject. Random noise does not make models robust by
itself. Random noise gives us a measurable probability gap. Sometimes that gap
is wide enough to draw a ball.

---

[^szegedy]: Christian Szegedy, Wojciech Zaremba, Ilya Sutskever, Joan Bruna, Dumitru Erhan, Ian Goodfellow, and Rob Fergus, ["Intriguing Properties of Neural Networks"](https://arxiv.org/abs/1312.6199), arXiv 2013.

[^goodfellow]: Ian J. Goodfellow, Jonathon Shlens, and Christian Szegedy, ["Explaining and Harnessing Adversarial Examples"](https://arxiv.org/abs/1412.6572), ICLR 2015.

[^pixeldp]: Mathias Lecuyer, Vaggelis Atlidakis, Roxana Geambasu, Daniel Hsu, and Suman Jana, ["Certified Robustness to Adversarial Examples with Differential Privacy"](https://arxiv.org/abs/1802.03471), IEEE Symposium on Security and Privacy 2019.

[^cohen]: Jeremy Cohen, Elan Rosenfeld, and Zico Kolter, ["Certified Adversarial Robustness via Randomized Smoothing"](https://proceedings.mlr.press/v97/cohen19c.html), ICML 2019.

[^salman]: Hadi Salman, Greg Yang, Jerry Li, Pengchuan Zhang, Huan Zhang, Ilya Razenshteyn, and Sebastien Bubeck, ["Provably Robust Deep Learning via Adversarially Trained Smoothed Classifiers"](https://arxiv.org/abs/1906.04584), NeurIPS 2019.

[^yang]: Greg Yang, Tony Duan, J. Edward Hu, Hadi Salman, Ilya Razenshteyn, and Jerry Li, ["Randomized Smoothing of All Shapes and Sizes"](https://arxiv.org/abs/2002.08118), ICML 2020.
