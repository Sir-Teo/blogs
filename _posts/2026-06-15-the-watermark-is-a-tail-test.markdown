---
layout: post
title: "The Watermark Is a Tail Test"
description: "LLM text watermarks are not visible signatures. They are statistical evidence accumulated token by token, and their reliability lives in entropy, length, false-positive budgets, and attack dilution."
date: 2026-06-15 09:30:00 -0400
categories: ai-systems
tags: [watermarking, llms, ai-generated-text, hypothesis-testing, provenance, detection, statistics]
excerpt: "A text watermark is a keyed statistical test. Short, low-entropy, heavily edited text may carry too little evidence; long high-entropy text can make the detector's tail light up."
---

The naive picture of an AI-text watermark is a hidden stamp.

Somewhere inside the paragraph, the model writes a secret mark. Later, a detector
finds it. The mark is either there or not there. Case closed.

That picture is too crisp.

Text is discrete, low-bandwidth, and fragile. You cannot hide a robust invisible
logo in an English sentence the way you can spread a signal over millions of
image pixels. A generated paragraph has only so many token choices where the
model is genuinely uncertain. If the next token is forced by grammar, a fact, or
a code identifier, a watermark has almost no room to move.

So the better picture is not a stamp. It is a hypothesis test.

```text
Did these token choices land
in a secret tail too often?
```

A detector does not see a confession. It sees a count, a score, or a keyed
correlation that would be rare under ordinary sampling. The watermark is the
excess probability mass in that tail.

<div class="callout">
  <strong>Claim:</strong> text watermarking is evidence accounting. The hard
  parts are not only cryptography or sampling. They are false-positive budgets,
  generation entropy, text length, partial edits, and what decision the
  detector is allowed to trigger.
</div>

## Green Tokens Are a Loaded Die

The cleanest public mental model is the "green list" watermark from
Kirchenbauer, Geiping, Wen, Katz, Miers, and Goldstein.[^kirchenbauer]

Before each token is sampled, a secret key and the local context choose a
pseudorandom subset of the vocabulary:

```text
green tokens
red tokens
```

The generator then softly promotes green tokens, for example by adding a small
logit bias $$\delta$$ to them before sampling. Humans should not notice a
particular green token. The detector, which knows the key, can replay the
green-list construction on the final text and count how often the generated
tokens fell in the green set.

If the green fraction is $$\gamma$$ and the text has $$T$$ scored tokens, then
under an unwatermarked null model the green count is approximately:

$$
G \sim \mathrm{Binomial}(T,\gamma).
$$

The simplest detector reports a z-score:

$$
z =
\frac{G-\gamma T}
{\sqrt{T\gamma(1-\gamma)}}.
$$

Large positive $$z$$ means the text hit the keyed green sets too often. The
one-sided p-value is the probability that ordinary, unwatermarked sampling would
produce at least that much excess green mass.

For finite text, the lab also computes the exact binomial survival probability
for the detector threshold. With the default $$T=240$$, $$\gamma=0.25$$, and
$$z \ge 4$$, the threshold is $$G \ge 87$$ green hits. The ideal-binomial
false-positive budget is about `7.1e-5`; the normal approximation gives
`3.2e-5`. They are the same order, but the finite-sample tail is the number I
would put on an evidence card.

This is why the detector can have interpretable p-values without seeing the
model weights. It does not need to know whether the prose is elegant, bland, or
plausible. It only asks whether a keyed randomized statistic is in the far
right tail.

## Entropy Is the Ink

The statistical test is simple. The generation side is not.

Suppose the model's next-token distribution is almost deterministic:

```text
probability("}") = 0.997
everything else  = crumbs
```

If `}` is red, a responsible sampler should still emit `}` almost every time.
If `}` is green, the watermark gets a free point. Either way, there is not much
choice to steer. Low entropy means low watermark capacity.

If the model is choosing among many plausible continuations, the watermark has
room to nudge without visibly damaging the text. This entropy dependence appears
throughout the literature. Kirchenbauer et al. derive sensitivity in terms of
the available randomness.[^kirchenbauer] The SynthID-Text paper states the same
operational lesson: longer text gives more evidence, and low-entropy model
distributions make detection harder because the sampler has fewer choices to
prefer.[^synthid-nature]

This is the first place where "watermarked or not" stops being a binary product
thought.

A watermark on a long creative answer is not the same instrument as a watermark
on a short factual answer, a JSON object, a code patch, a quote, or a math
expression. The latter may be too constrained to carry much signal without
changing the output.

## Detection Is a Tail Budget

A detector threshold is not merely a technical setting. It is a social and
product setting.

If a platform scans ten thousand documents, a 1% false-positive rate is already
a lot of people. If it scans a billion snippets, even a 0.001% false-positive
rate can become operationally loud. The threshold must be chosen against the
number of decisions, the cost of a mistaken accusation, and whether the detector
will accuse, route to review, add weak metadata, or simply abstain.

That is why I like the z-score picture. It keeps the false-positive budget in
view:

```text
weak evidence:      route nowhere
moderate evidence:  add a soft signal
strong evidence:    escalate or combine
```

Watermarks are often discussed as if they are a replacement for provenance.
They are not. They are one evidence channel. Cryptographic content credentials,
server-side logs, disclosure policy, user education, and post-hoc classifiers
can all carry different parts of the burden. The Nature paper on SynthID-Text
makes this point bluntly: no text detection method is foolproof, and methods can
be complementary.[^synthid-nature]

## A Browser-Sized Detector

The lab below implements a simplified green-list watermark.

It does not call an LLM. Instead, it builds a synthetic next-token distribution
over 64 symbols. The **Entropy** slider controls how concentrated that
distribution is. The **Green fraction** slider controls how many tokens are
eligible for the secret list. The **Watermark bias** slider adds a logit bonus
to green tokens during sampling.

Then the detector counts green hits and computes the z-score above.

The attack is deliberately simple:

- **Edits** replace a fraction of watermarked tokens with ordinary samples;
- **Human mix** inserts unwatermarked spans into the document;
- the detector still scores the whole document, so the signal is diluted.

This is not SynthID, not the exact Kirchenbauer implementation, and not a
security proof. It is a microscope for the statistical shape.

The **Audit** tile is generated by the same script as the simulator. Its
exported `runAudit()` performs 20 named checks: normal-tail sanity, centered
z-scores, exact-binomial threshold conversion, binomial-tail monotonicity,
distribution normalization, zero-bias identity, positive-bias KL tax, expected
green-share increase, complete token tapes, bounded probabilities and shares,
attack metadata accounting, clean-versus-attacked power ordering, mean-score
dilution under edits and human mix, token-sweep recovery with length, stricter
thresholds spending less false-positive budget, and the 144-case parameter grid
over seeds, green fractions, biases, entropies, and edit rates.

<style>
  .watermark-lab {
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

  .watermark-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .watermark-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .watermark-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .watermark-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0;
  }

  .watermark-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .watermark-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .watermark-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .watermark-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .watermark-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .watermark-lab__legend span,
  .watermark-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .watermark-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .watermark-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="watermark-lab" data-watermark-lab>
  <div class="watermark-lab__controls">
    <label>
      Seed <output data-value="seed">7</output>
      <input type="range" data-param="seed" min="1" max="80" step="1" value="7">
    </label>
    <label>
      Scored tokens <output data-value="tokens">240</output>
      <input type="range" data-param="tokens" min="40" max="1100" step="20" value="240">
    </label>
    <label>
      Green fraction <output data-value="gamma">25%</output>
      <input type="range" data-param="gamma" min="5" max="50" step="1" value="25">
    </label>
    <label>
      Watermark bias <output data-value="bias">1.6</output>
      <input type="range" data-param="bias" min="0" max="3.5" step="0.1" value="1.6">
    </label>
    <label>
      Entropy <output data-value="entropy">68%</output>
      <input type="range" data-param="entropy" min="0" max="100" step="1" value="68">
    </label>
    <label>
      Edits <output data-value="edits">20%</output>
      <input type="range" data-param="edits" min="0" max="90" step="1" value="20">
    </label>
    <label>
      Human mix <output data-value="human">25%</output>
      <input type="range" data-param="human" min="0" max="90" step="1" value="25">
    </label>
    <label>
      z threshold <output data-value="threshold">4.0</output>
      <input type="range" data-param="threshold" min="1.5" max="6" step="0.1" value="4">
    </label>
  </div>
  <div class="watermark-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="Text watermark detector simulator showing z-score tails, detection power by length, quality tax, and an attacked token tape"></canvas>
  <div class="watermark-lab__legend">
    <span><i style="background:#64748b"></i> Null</span>
    <span><i style="background:#0f766e"></i> Watermarked</span>
    <span><i style="background:#be123c"></i> Edited or mixed</span>
    <span><i style="background:#7c3aed"></i> Decision threshold</span>
    <span><i style="background:#f59e0b"></i> Edited token</span>
    <span><i style="background:#2563eb"></i> Human span</span>
  </div>
  <p class="watermark-lab__note">
    Deterministic toy simulation. The audit counter comes from the exported
    JavaScript and includes exact binomial-tail checks plus the 144-case
    parameter grid. Real watermarking systems use richer keyed context
    functions and stronger threat models.
  </p>
</div>
<script defer src="{{ '/assets/js/watermark-tail-lab.js?v=20260615b' | relative_url }}"></script>

With the default settings, the clean watermark is detected almost every time at
$$z \ge 4$$. The attacked document is weaker: edits and unwatermarked spans
dilute the green-token surplus. Raise **Scored tokens** and the attacked curve
recovers. Lower it and the detector becomes evidence-poor.

The deterministic default audit reports clean power `100%`, attacked power
`87.5%`, and no null hits in the 96-document display Monte Carlo. One attacked
document lands on `99` green hits, so its score is $$z=5.81$$ and its exact
ideal-binomial p-value is `2.6e-8`. Those numbers are not a guarantee for real
models. They are a calibration check on the toy detector.

Now lower **Entropy**. The detector weakens even when the bias is unchanged.
The model is too certain to carry much hidden signal. Raise **Watermark bias**.
Detection improves, but the quality-tax panel rises because the sampler is
moving farther from the base distribution. That is the central engineering
trade-off.

Finally, lower **z threshold**. Power rises, but so do false positives. A
detector that will only route text to a private review queue can tolerate a
different threshold from a detector that will label a student, journalist, or
developer as deceptive.

## Edits Do Not Erase Evidence; They Dilute It

A common objection is: "Can I not just paraphrase the output?"

Sometimes yes. Sometimes no. The interesting answer is statistical.

If a paraphrase is a total rewrite with no dependency on the original token
choices, the keyed token statistic is mostly gone. But realistic paraphrases
often copy phrases, keep n-grams, preserve local choices, or mix rewritten
sentences with untouched text. Kirchenbauer and collaborators studied human
rewrites, machine paraphrases, and watermarked spans embedded inside longer
documents; their finding was not that attacks are harmless, but that attacks
dilute rather than magically delete the signal when enough original evidence
survives.[^reliability]

That is why windowed detectors matter. A whole-document score can miss a short
watermarked span buried inside a long human article. A sliding-window detector
can ask a more local question:

```text
where is the tail unusually bright?
```

The lab intentionally uses the cruder whole-document score, so the dilution is
easy to see. Increase **Human mix** and the z-score falls. A production detector
would need span-sensitive scoring, abstention, and careful multiple-testing
control across windows.

## Distortion-Free Does Not Mean Evidence-Free

The green-list story is distortionary in the ordinary sense: it changes the
next-token distribution by promoting one set of tokens. That can be acceptable
if the bias is small and the entropy is high, but it is not the only possible
watermarking philosophy.

Kuditipudi, Thickstun, Hashimoto, and Liang proposed robust distortion-free
watermarks that map keyed random numbers to samples from the language model,
then detect by aligning the final text to that keyed random sequence.[^kuditipudi]
Christ, Gunn, and Zamir gave a cryptographic definition of undetectable
watermarks: without the secret key, distinguishing watermarked outputs from
ordinary model outputs should be computationally intractable.[^christ]

SynthID-Text is another important step because it is not just a paper toy. The
Nature paper describes a production-oriented scheme that modifies only the
sampling procedure, makes detection efficient without the underlying LLM, and
was evaluated in a live Gemini experiment over nearly 20 million responses
without a significant detected quality change.[^synthid-nature] Google DeepMind
also released a reference implementation for research use.[^synthid-code]

These systems differ in machinery: green lists, Gumbel or inverse-transform
schemes, tournament sampling, learned Bayesian scores, robustness mechanisms,
and cryptographic definitions. But they share one quiet fact:

```text
the detector accumulates keyed evidence
```

The evidence may be a green-token count, a score against random functions, or an
alignment to a secret random sequence. The product still has to decide how much
tail probability is enough.

## What I Would Want On the Label

Before trusting a text-watermark claim, I would want a small evidence card:

- false-positive rate at the chosen threshold;
- measured true-positive rate by token length;
- performance on low-entropy outputs such as facts, code, and templates;
- robustness under edits, paraphrase, translation, and mixed-source documents;
- whether the detector can localize spans or only score whole documents;
- who controls the key and who is allowed to verify;
- what action follows a positive result.

The last item is not policy garnish. It changes the detector's acceptable error
rate. A watermark used for internal routing can be noisy. A watermark used for
public accusation needs a much stricter tail and usually corroborating evidence.

This is the reason I do not like the phrase "AI detector" when it is used as a
single button. A watermark detector with a private key is better grounded than a
post-hoc style classifier in many settings, but it is still a statistical
instrument. It has a null distribution, a power curve, and an attack surface.

The watermark is not a stamp.

It is a claim that a sequence of small choices landed too often where a secret
key said they should.

[^kirchenbauer]: John Kirchenbauer, Jonas Geiping, Yuxin Wen, Jonathan Katz, Ian Miers, and Tom Goldstein, ["A Watermark for Large Language Models"](https://arxiv.org/abs/2301.10226), ICML 2023.

[^synthid-nature]: Sumanth Dathathri, Abigail See, Sumedh Ghaisas, Po-Sen Huang, Rob McAdam, et al., ["Scalable watermarking for identifying large language model outputs"](https://www.nature.com/articles/s41586-024-08025-4), *Nature*, 2024.

[^reliability]: John Kirchenbauer et al., ["On the Reliability of Watermarks for Large Language Models"](https://arxiv.org/abs/2306.04634), ICLR 2024.

[^kuditipudi]: Rohith Kuditipudi, John Thickstun, Tatsunori Hashimoto, and Percy Liang, ["Robust Distortion-free Watermarks for Language Models"](https://arxiv.org/abs/2307.15593), TMLR 2024.

[^christ]: Miranda Christ, Sam Gunn, and Or Zamir, ["Undetectable Watermarks for Language Models"](https://arxiv.org/abs/2306.09194), 2023.

[^synthid-code]: Google DeepMind, ["synthid-text"](https://github.com/google-deepmind/synthid-text), reference implementation for the SynthID Text research paper.
