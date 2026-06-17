---
layout: post
title: "The Path Is Not Its Marginals"
description: "Viterbi decoding and posterior decoding both look through the same HMM trellis, but they optimize different losses. The most likely story is not always made of the most likely scenes."
date: 2026-06-16 22:45:00 -0400
categories: machine-learning
tags: [hidden-markov-models, viterbi, forward-backward, dynamic-programming, probabilistic-modeling, sequence-models, statistics]
excerpt: "A hidden Markov model has at least two honest answers to the question 'what happened?' One answer is the best whole path. Another is the best label at each time. They can disagree."
---

There are two different sentences that sound like the same sentence:

```text
What is the most likely hidden path?
What is the most likely hidden state at each time?
```

A hidden Markov model makes them different.

That difference is not a numerical nuisance. It is a loss function.

Suppose the hidden states are $$q_1,\ldots,q_T$$ and the observations are
$$o_1,\ldots,o_T$$. The model has an initial distribution $$\pi$$, transition
probabilities $$a_{ij}$$, and emission probabilities $$b_j(o)$$. The joint
probability of one hidden story is

$$
p(q_{1:T},o_{1:T})
=
\pi_{q_1}b_{q_1}(o_1)
\prod_{t=2}^T
a_{q_{t-1},q_t}b_{q_t}(o_t).
$$

Viterbi decoding asks for the single path with the largest joint probability:

$$
\hat q^{\mathrm{path}}
=
\arg\max_{q_{1:T}} p(q_{1:T},o_{1:T}).
$$

Because $$p(o_{1:T})$$ is the same denominator for every path, this is also the
maximum posterior path.

Posterior decoding asks a different question. It computes

$$
\gamma_t(i)=p(q_t=i\mid o_{1:T})
$$

and then chooses the best label at each time:

$$
\hat q^{\mathrm{marginal}}_t
=
\arg\max_i \gamma_t(i).
$$

The first answer is a story. The second answer is a set of scenes.

## The Same Trellis, Two Algebras

The forward recursion sums over all paths that end in a state:

$$
\alpha_t(j)
=
\left(\sum_i \alpha_{t-1}(i)a_{ij}\right)b_j(o_t).
$$

The Viterbi recursion changes one word:

$$
\delta_t(j)
=
\max_i \delta_{t-1}(i)a_{ij}b_j(o_t).
$$

That replacement, $$\sum \rightarrow \max$$, is the whole personality change.
The forward-backward algorithm is doing accounting over all explanations. The
Viterbi algorithm is pruning all but the best prefix into each state.

Both are dynamic programs on the same trellis. They do not answer the same
question.

This is why a marginal label sequence can be strange. It may pick the locally
most likely state at every time and still be a weak whole path. In models with
zero-probability transitions, it can even stitch together an impossible path.
Mark Stamp's HMM tutorial uses a small tree-ring example to make exactly this
point: the dynamic-programming best sequence and the per-position HMM posterior
sequence need not match, even when all transitions are legal.[^stamp]

## A Small Alarm System

The lab below uses a two-state HMM:

```text
Q = quiet
R = risk
C = calm observation
A = alarm observation
```

The sensor is only moderately reliable. The hidden state is sticky: once the
world is quiet, it tends to stay quiet; once risky, it tends to stay risky.

With the default settings:

```text
observations                 CACAACACCA
Viterbi path                 QQQQQQQQQQ
posterior labels             QRRRRRRQQR
disagreements                7 / 10
Viterbi path posterior mass  9.695%
posterior-label path mass    0.390%
expected correct labels      5.578 vs 4.922
log p(observations)          -7.294
```

The posterior labels win the pointwise game: they would score more expected
correct states if every time step were graded independently. But as a story,
`QRRRRRRQQR` pays for too many switches. The Viterbi decoder says: all those
borderline alarms are cheaper to explain as sensor noise than as a rapid hidden
state itinerary.

<style>
  .hmm-lab {
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

  .hmm-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .hmm-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hmm-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hmm-lab input,
  .hmm-lab select {
    accent-color: #7c3aed;
    width: 100%;
  }

  .hmm-lab select {
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    padding: 0.28rem 0.35rem;
  }

  .hmm-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .hmm-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .hmm-lab__metric.good {
    border-color: #b8b4ee;
  }

  .hmm-lab__metric.warn {
    border-color: #f2c37a;
  }

  .hmm-lab__metric span,
  .hmm-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hmm-lab__metric span {
    display: block;
  }

  .hmm-lab__metric strong {
    display: block;
    font-size: 0.94rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .hmm-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hmm-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="hmm-trellis-lab" class="hmm-lab" data-hmm-trellis-lab>
  <div class="hmm-lab__controls">
    <label>
      Pattern:
      <select data-param="pattern">
        <option value="burst" selected>bursty alarms</option>
        <option value="alternating">alternating</option>
        <option value="block">blocky regime</option>
        <option value="quiet">rare alarms</option>
        <option value="generated">generated</option>
      </select>
    </label>
    <label>
      Persistence: <output data-value="persistence">85%</output>
      <input type="range" min="55" max="97" step="1" value="85" data-param="persistence">
    </label>
    <label>
      Sensor accuracy: <output data-value="sensor">66%</output>
      <input type="range" min="52" max="92" step="1" value="66" data-param="sensor">
    </label>
    <label>
      Prior risk: <output data-value="prior">50%</output>
      <input type="range" min="5" max="95" step="1" value="50" data-param="prior">
    </label>
    <label>
      Length: <output data-value="length">10</output>
      <input type="range" min="4" max="24" step="1" value="10" data-param="length">
    </label>
    <label>
      Seed: <output data-value="seed">37</output>
      <input type="range" min="1" max="997" step="1" value="37" data-param="seed">
    </label>
  </div>
  <div class="hmm-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="Hidden Markov model trellis lab comparing Viterbi path decoding and posterior marginal decoding"></canvas>
  <p class="hmm-lab__note">
    Deterministic browser experiment. The code computes forward-backward
    posteriors and the Viterbi path in the log domain, then scores both decoded
    sequences under the same HMM.
  </p>
</div>
<script defer src="{{ '/assets/js/hmm-trellis-lab.js?v=20260616a' | relative_url }}"></script>

Try three moves.

1. Lower Persistence toward 55%. The transition penalty weakens. In the default
   bursty sequence, the disagreement can disappear because switching is no
   longer expensive enough to make a smooth story dominate.
2. Raise Sensor accuracy. Alarms become harder to explain away. The posterior
   probabilities sharpen, and eventually Viterbi has to buy switches too.
3. Change Pattern to alternating. This is the adversarial case for a sticky
   hidden state: every local clue wants to flip, while the path objective asks
   how many flips a plausible story can afford.

The lab is intentionally small, but the warning scales.

## When The Objective Changes The Product

In speech recognition, a Viterbi decoder may return one word sequence. In a
biosequence model, it may return one gene annotation. In a tracking problem, it
may return one trajectory. In all of these cases, the answer has a contract:
one coherent sequence.

But sometimes the product is not a coherent sequence. It is a per-time heatmap,
an uncertainty band, a calibrated alert probability, or an expected number of
correct labels. Then marginal posteriors are not a consolation prize. They are
the object.

This is the same split that appears in coding theory. Viterbi decoding is a
maximum-likelihood sequence method. Bahl, Cocke, Jelinek, and Raviv developed a
forward-backward style algorithm for a different target: posterior state and
transition probabilities, useful for minimizing symbol error rather than whole
word/path error.[^bcjr]

That distinction is easy to miss because both algorithms draw the same lattice.
The data structure is not the objective.

## A Useful Review Checklist

When I see HMM-style decoding in a system, I want four questions answered.

First: what loss is being optimized? Whole-sequence accuracy, per-label
accuracy, calibrated state probability, change-point timing, or downstream
utility?

Second: are impossible transitions actually impossible, or merely rare? A
marginal decoder can return adjacent labels that are individually likely but
not jointly admissible if the transition matrix has zeros.

Third: are the probabilities being normalized in log space? The classic HMM
recursions multiply many probabilities. Without scaling or logs, long sequences
turn inference into an underflow experiment.

Fourth: is the path being treated as truth? A Viterbi path can have small
posterior mass even when it is the largest single path, because the remaining
mass is spread across many near-ties. In the default lab, the best path has only
about 9.7% posterior mass. That is not a confession. It is the posterior saying:
there are many plausible stories.

## The One Sentence I Trust

Viterbi gives the best complete story under the model.

Forward-backward tells you how much the model believes each scene after reading
the whole story.

Do not ask one of them to do the other's job.

## Paper Trail

[^viterbi]: Andrew J. Viterbi, ["Error Bounds for Convolutional Codes and an Asymptotically Optimum Decoding Algorithm"](https://dl.acm.org/doi/10.1109/TIT.1967.1054010), *IEEE Transactions on Information Theory*, 1967. A public PDF copy is hosted by Washington University [here](https://www.essrl.wustl.edu/~jao/itrg/viterbi.pdf).

[^forney]: G. David Forney Jr., ["The Viterbi Algorithm"](https://www.scirp.org/reference/referencespapers?referenceid=4116433), *Proceedings of the IEEE*, 1973. DOI: [10.1109/PROC.1973.9030](https://doi.org/10.1109/PROC.1973.9030). Forney's later historical note is available on [arXiv](https://arxiv.org/pdf/cs/0504020).

[^rabiner]: Lawrence R. Rabiner, ["A tutorial on hidden Markov models and selected applications in speech recognition"](https://www.cs.cmu.edu/~cga/behavior/rabiner1.pdf), *Proceedings of the IEEE*, 1989. Metadata and DOI: [10.1109/5.18626](https://oamonitor.ireland.openaire.eu/rfo/sfi_rfo/search/publication?pid=10.1109%2F5.18626).

[^stamp]: Mark Stamp, ["A Revealing Introduction to Hidden Markov Models"](https://www.cs.sjsu.edu/~stamp/RUA/HMM.pdf), 2021 version. The tutorial explicitly contrasts the dynamic-programming best sequence with per-position posterior decoding in its tree-ring example.

[^bcjr]: L. R. Bahl, J. Cocke, F. Jelinek, and J. Raviv, ["Optimal Decoding of Linear Codes for Minimizing Symbol Error Rate"](https://research.ibm.com/publications/optimal-decoding-of-linear-codes-for-minimizing-symbol-error-rate), *IEEE Transactions on Information Theory*, 1974. DOI: [10.1109/TIT.1974.1055186](https://doi.org/10.1109/TIT.1974.1055186).
