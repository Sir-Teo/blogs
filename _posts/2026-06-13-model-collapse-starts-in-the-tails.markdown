---
layout: post
title: "Models Forget the Weird Stuff First"
description: "Recursive training can look healthy in the average case while sampling, filtering, and reuse quietly sand away rare modes."
date: 2026-06-13 04:33:00 -0400
categories: machine-learning
tags: [model-collapse, synthetic-data, generative-models, data-provenance, long-tails, ai-safety]
excerpt: "Model collapse does not have to begin as nonsense. It can begin as tail amnesia: fewer rare cases, fewer odd styles, fewer low-frequency facts, all hidden behind fluent average samples."
---

The cartoon version of model collapse is easy to picture: future models train
on AI-generated sludge, errors compound, and the whole web becomes a blurry copy
of a copy. It is dramatic. It is also too late.

The subtler version is more useful.

A model can begin collapsing while its samples still look polished. The first
thing to disappear is not grammar. It is the tail: rare facts, minority dialects,
odd visual styles, unusual edge cases, low-resource languages, niche technical
details, and examples that were already hard to sample. The average output can
improve in surface quality while the support of the distribution shrinks.

That is why I think model collapse is best understood as a data-provenance and
tail-risk problem, not as a slogan about synthetic data being bad.

Synthetic data can be useful. Diffusion-generated images can improve ImageNet
classifiers when used as curated augmentation.[^azizi] TinyStories showed that
carefully generated synthetic stories can create a clean laboratory for small
language models.[^tinystories] Phi-1 used filtered web data plus synthetic
"textbook quality" data to train a surprisingly capable small code model.[^phi]

The danger is not synthetic data in general. The danger is recursive synthetic
data without lineage, mixture control, and tail audits.

## The Loop That Looks Clean

Suppose the world has a true data distribution $$p^\*(x)$$. A model trained on
samples from that world learns an approximation $$p_0(x)$$. It generates data.
Some of that generated data enters the next training set. The next model learns
from a mixture:

$$
D_{t+1}
=
(1-\rho-\gamma)D_{\mathrm{fresh}}
+
\gamma D_{\mathrm{archive}}
+
\rho D_{\mathrm{synthetic},t}.
$$

Here $$\rho$$ is the synthetic share and $$\gamma$$ is a protected real-data
archive share. The synthetic component comes from the previous model:

$$
x \sim p_t(x).
$$

If sampling were infinite, models were perfect, filters were neutral, and the
true distribution were always replenished, this loop would be less scary. Real
systems do not get those gifts. They sample finitely. They filter. They prefer
high-confidence outputs. They deduplicate. They scrape without perfect source
metadata. They overweight whatever is cheap, abundant, and clean-looking.

Those choices are enough to create a ratchet:

```text
slightly under-sample the tail
train on the under-sampled tail
generate an even thinner tail
filter for high-confidence samples
repeat
```

Shumailov et al. call the resulting degradation **model collapse**. Their Nature
paper reports that indiscriminate use of model-generated content in training can
produce irreversible defects, with tails of the original distribution
disappearing.[^shumailov] Alemohammad et al. study a related self-consuming loop
for generative image models and call it Model Autophagy Disorder: without enough
fresh real data, quality or diversity degrades across generations.[^mad]

The word "collapse" sounds sudden. The mechanism is usually gradual.

## A Small Machine for Tail Amnesia

The lab below is deliberately small. The "world" is an 18-mode distribution:
six common modes and twelve rare modes. Each generation trains a new empirical
model from a mixture of:

1. fresh real samples from the true distribution;
2. a protected real-data archive, also drawn from the true distribution;
3. synthetic samples from the previous model.

The generator can be sharpened by low temperature and by a "quality filter" that
prefers high-probability samples. That filter is meant to mimic a common
pipeline habit: keep the clean, confident, normal-looking generations and throw
away the weird ones.

<div class="collapse-lab" data-collapse-lab>
  <div class="collapse-lab__controls">
    <label>
      Synthetic share: <output data-value="syntheticShare">75%</output>
      <input type="range" min="0" max="100" step="5" value="75" data-param="syntheticShare">
    </label>
    <label>
      Real archive share: <output data-value="archiveShare">10%</output>
      <input type="range" min="0" max="80" step="5" value="10" data-param="archiveShare">
    </label>
    <label>
      Sample budget: <output data-value="sampleBudget">1600</output>
      <input type="range" min="300" max="6000" step="100" value="1600" data-param="sampleBudget">
    </label>
    <label>
      Generator temperature: <output data-value="temperature">0.85</output>
      <input type="range" min="45" max="150" step="5" value="85" data-param="temperature">
    </label>
    <label>
      Quality-filter strength: <output data-value="filterStrength">35%</output>
      <input type="range" min="0" max="120" step="5" value="35" data-param="filterStrength">
    </label>
    <label>
      True rare mass: <output data-value="rareMass">18%</output>
      <input type="range" min="4" max="35" step="1" value="18" data-param="rareMass">
    </label>
    <label>
      Generations: <output data-value="generations">12</output>
      <input type="range" min="1" max="30" step="1" value="12" data-param="generations">
    </label>
    <label>
      Source smoothing: <output data-value="smoothing">1%</output>
      <input type="range" min="0" max="8" step="1" value="1" data-param="smoothing">
    </label>
  </div>
  <div class="collapse-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="610" aria-label="Model collapse simulator showing tail mass, entropy, rare mode coverage, and KL divergence across recursive training generations"></canvas>
  <div class="collapse-lab__legend">
    <span><i style="background:#64748b"></i> True distribution</span>
    <span><i style="background:#0f766e"></i> Final model</span>
    <span><i style="background:#be123c"></i> Rare-tail mass</span>
    <span><i style="background:#7c3aed"></i> Distribution drift</span>
  </div>
  <p class="collapse-lab__note">
    Deterministic synthetic experiment. It is a finite-sample categorical model,
    not a language model. The point is to expose the feedback arithmetic:
    generated samples become training data for the next generation.
  </p>
</div>
<script defer src="{{ '/assets/js/model-collapse-lab.js' | relative_url }}"></script>

Try the default setting first. The final model still has sensible common modes,
but the tail is much thinner. This is early collapse: the distribution has
become less surprising while still looking coherent.

Now set synthetic share to 100%, lower temperature, and raise the quality
filter. The model becomes self-consuming. Rare modes vanish, entropy falls, and
KL divergence grows. The average sample can look high-confidence because the
model is saying fewer things.

Then add a real archive share or fresh real data. The collapse slows or
reverses. This is the most important behavior in the lab: the cure is not
"never use synthetic data." The cure is to keep an anchored measurement channel
to the world.

Finally, raise temperature and lower the filter. Diversity improves, but
sampling noise remains. A high-temperature generator can preserve support better
than a sharpened one, but it may produce lower-quality individual samples. That
is the core synthetic-data tradeoff:

$$
\text{precision} \quad \text{versus} \quad \text{recall of the data distribution}.
$$

If the curation pipeline prices only precision, recall quietly pays.

## Rare Things Lose Twice

Rare modes are fragile because every step sees fewer of them.

If a mode has true probability $$p_i = 0.001$$ and a generation samples
$$n = 10{,}000$$ examples, the expected count is only 10. Ordinary sampling
noise can undercount it. A filter that prefers high-probability samples can
undercount it again. A model trained on that corpus estimates a smaller
probability. The next generation samples from the smaller probability.

The recursion is multiplicative:

$$
p_{t+1}(i)
\approx
(1-\rho)p^\*(i)
+
\rho \hat{p}_t(i)
\quad
\text{filtering and finite-sample error}.
$$

When $$\rho$$ is high and the filter is sharp, a rare mode that falls behind has
little chance to recover. Common modes have many samples and many chances. Rare
modes have one bad generation and then a thinner future.

This is why model collapse can be hard to notice from aggregate quality metrics.
A benchmark dominated by common cases may look stable while minority cases
degrade. A human evaluator may prefer the cleaner synthetic sample. A
deduplication filter may remove messy real artifacts while leaving polished
model style intact. The loss is not evenly distributed.

## Use Synthetic Data Like a Tool, Not a Food Chain

There is a lazy anti-synthetic-data argument that should be avoided:

```text
synthetic data is fake, therefore training on it is bad
```

That is too crude. Synthetic data is often a way to specify a task, balance a
dataset, create a controlled curriculum, distill a teacher, augment rare labels,
or build a model organism. The success of TinyStories and Phi-style textbook
data is not a paradox. Those datasets are generated for a purpose and filtered
against a specification.[^tinystories], [^phi]

The dangerous case is different:

```text
the model's own unlabelled outputs become the world
```

In that loop, synthetic data is not a designed intervention. It is
unaccounted-for contamination. The model is no longer learning from the process
we wanted to model. It is learning from an increasingly model-shaped proxy.

Villalobos et al. forecast that public human-generated text may become a
constraint for continued LLM scaling this decade, and discuss synthetic data,
transfer, and data efficiency as possible responses.[^villalobos] That makes
the question practical rather than philosophical. If synthetic data becomes a
large part of the training diet, the mixture needs instrumentation.

The same point appears from the data-centric side. DataComp argues that dataset
design deserves experimental attention, not just model architecture tinkering:
with a fixed CLIP training recipe, better data curation produced better
downstream results.[^datacomp] Model-collapse risk is a negative version of the
same lesson. Dataset composition is an algorithm.

## Provenance Belongs in the Dataset, Not the Appendix

The word provenance often sounds legal or archival. In this context it is also a
statistical feature.

For each training item, I want to know:

1. human-created, model-created, edited, translated, distilled, or mixed;
2. which model or tool created it, if synthetic;
3. which prompt, filter, or selection policy produced it;
4. whether it belongs to a protected real-data archive;
5. which domain, language, demographic proxy, or rare cluster it supports;
6. whether it has been used in previous generations of training.

Without that ledger, a training run cannot answer basic questions:

```text
How much of this batch is the model eating itself?
Which tails are shrinking?
Which filters are deleting minority modes?
Which real sources still anchor the distribution?
```

Provenance tools are imperfect. Metadata can be stripped. Watermarks can fail.
Standards require coordination. The NTIA notes these practical difficulties for
AI output disclosures, and NIST's synthetic-content risk guidance similarly
describes provenance as useful but not magical.[^ntia], [^nist] A recent paper
on data authenticity, consent, and provenance argues that current tools are not
enough by themselves and calls for broader provenance standards.[^provenance]

That caveat is important. Provenance is not a silver bullet. But without it,
synthetic-data mixture control becomes guesswork.

## What I Would Put on the Dashboard

A serious training-data pipeline should treat collapse as an operational risk.
The dashboard should not only count tokens or images. It should track support.

I would monitor:

1. synthetic share by source, model, domain, and generation;
2. protected real-data anchor share;
3. tail mass by topic, language, dialect, geography, and content type;
4. nearest-neighbor concentration in embedding space;
5. entropy and effective cluster count over time;
6. rare benchmark slices that are not overrepresented in synthetic data;
7. filter rejection rates by subgroup and domain;
8. whether generated data improves a target task without shrinking unrelated
   coverage.

The last item is easy to miss. Synthetic data can improve one benchmark while
damaging distributional breadth elsewhere. That is not necessarily a reason to
avoid it. It is a reason to declare the trade.

In the lab, the protected archive is a crude stand-in for source diversity. In a
real system, the archive would not be one blob of old data. It would be a
stratified, consented, documented, actively refreshed reference set. The point is
to preserve a measurement relationship with the world, especially where the
world is rare.

## The Research Problem Under the Mess

The research direction I want is collapse-aware data accounting.

Instead of treating a training set as a bag of examples, treat it as a dynamic
system:

$$
D_{t+1}
=
F(D_t, M_t, C_t, H_t),
$$

where $$M_t$$ is the current model, $$C_t$$ is the curation policy, and $$H_t$$
is the human or real-world data stream. Then ask:

$$
\frac{d}{dt}
\text{support}(D_t)
\quad
\text{by subgroup, domain, and rare feature}.
$$

The goal is not to ban generated data. The goal is to know when generated data
is augmentation, when it is distillation, when it is contamination, and when it
is recursion.

Model collapse starts as tail amnesia. If we wait for gibberish, the important
loss already happened.

## Works Cited

[^shumailov]: Ilia Shumailov, Zakhar Shumaylov, Yiren Zhao, Yarin Gal, Nicolas Papernot, Ross Anderson, "AI models collapse when trained on recursively generated data," *Nature*, 2024. [Nature](https://www.nature.com/articles/s41586-024-07566-y). Earlier version: "The Curse of Recursion: Training on Generated Data Makes Models Forget," 2023. [arXiv](https://arxiv.org/abs/2305.17493).

[^mad]: Sina Alemohammad, Josue Casco-Rodriguez, Lorenzo Luzi, Ahmed Imtiaz Humayun, Hossein Babaei, Daniel LeJeune, Ali Siahkoohi, and Richard G. Baraniuk, "Self-Consuming Generative Models Go MAD," ICLR 2024. [arXiv](https://arxiv.org/abs/2307.01850).

[^azizi]: Shekoofeh Azizi, Simon Kornblith, Chitwan Saharia, Mohammad Norouzi, and David J. Fleet, "Synthetic Data from Diffusion Models Improves ImageNet Classification," TMLR 2023. [arXiv](https://arxiv.org/abs/2304.08466).

[^tinystories]: Ronen Eldan and Yuanzhi Li, "TinyStories: How Small Can Language Models Be and Still Speak Coherent English?" 2023. [arXiv](https://arxiv.org/abs/2305.07759).

[^phi]: Suriya Gunasekar et al., "Textbooks Are All You Need," 2023. [arXiv](https://arxiv.org/abs/2306.11644).

[^villalobos]: Pablo Villalobos, Anson Ho, Jaime Sevilla, Tamay Besiroglu, Lennart Heim, and Marius Hobbhahn, "Will we run out of data? Limits of LLM scaling based on human-generated data," 2022. [arXiv](https://arxiv.org/abs/2211.04325).

[^datacomp]: Samir Yitzhak Gadre et al., "DataComp: In search of the next generation of multimodal datasets," 2023. [arXiv](https://arxiv.org/abs/2304.14108).

[^ntia]: National Telecommunications and Information Administration, "AI Output Disclosures: Use, Provenance, Adverse Incidents." [NTIA](https://www.ntia.gov/issues/artificial-intelligence/ai-accountability-policy-report/developing-accountability-inputs-a-deeper-dive/information-flow/ai-output-disclosures).

[^nist]: NIST, "Reducing Risks Posed by Synthetic Content," NIST AI 100-4, 2024. [PDF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-4.pdf).

[^provenance]: Shayne Longpre et al., "Data Authenticity, Consent, and Provenance for AI Are All Broken," 2024. [MIT Generative AI Impact Consortium](https://mit-genai.pubpub.org/pub/uk7op8zs), [arXiv](https://arxiv.org/html/2404.12691v1).
