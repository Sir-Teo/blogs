---
layout: post
title: "The Model Learns the Comparisons You Show It"
description: "Preference optimization is not a direct tap into human values. It is a policy update seen through pairwise labels, a reference model, a KL temperature, and the comparison distribution."
date: 2026-06-13 08:34:00 -0400
categories: machine-learning
tags: [preference-optimization, rlhf, dpo, alignment, bradley-terry, policy-optimization, human-feedback]
excerpt: "DPO makes preference tuning feel almost like ordinary supervised learning. The dangerous part is forgetting what the loss can and cannot see: only the pairs in the data, relative to a reference policy."
---

The simplest human feedback interface is not a score.

It is a pair:

```text
Which answer is better, A or B?
```

This is a small question with a large shadow. A pairwise preference can train a
reward model, rank summaries, steer a dialogue model, tune a recommender, and
make a language model feel more useful. It can also quietly encode labeler
habits, sampling bias, length preference, style preference, and the blind spots
of the policy that generated the candidates.

Preference optimization is powerful because comparison is cheap.

It is dangerous because comparison is local.

## A Pair Is Not a Reward

The Bradley-Terry model is the old statistical grammar behind many modern
preference systems.[^bradley-terry] Give each item a latent score $$r_i$$. Then
the probability that item $$i$$ beats item $$j$$ is:

$$
P(i \succ j)
=
\sigma(r_i - r_j).
$$

Only differences matter. If every score is shifted by the same constant, the
preference probabilities are unchanged. That sounds harmless until we remember
that language-model alignment is not usually deciding between fixed wines,
teams, or treatments. It is deciding which regions of a huge output space a
policy should visit more often.

A comparison says:

```text
this answer beat that answer in this context
```

It does not say:

```text
we have discovered the global reward function
```

The missing phrase is "among the candidates we showed the labeler."

## The RLHF Shape

Christiano, Leike, Brown, Martic, Legg, and Amodei showed that agents could
learn complex behaviors from human preferences over trajectory segments, rather
than from a hand-written reward function.[^christiano] Ziegler and collaborators
carried reward learning from human preferences into language-model fine-tuning
settings.[^ziegler] Ouyang and collaborators then made the now-familiar
InstructGPT pipeline concrete: supervised fine-tuning from demonstrations,
ranking model outputs, reward-model training, and reinforcement learning against
that reward model.[^instructgpt]

The idealized objective has a clean form. Given a reference policy
$$\pi_{\mathrm{ref}}$$ and a learned reward $$r$$, choose a policy $$\pi$$ that
trades reward against movement away from the reference:

$$
\max_{\pi}
\mathbb{E}_{y \sim \pi}[r(y)]
-
\beta
D_{\mathrm{KL}}(\pi \,\Vert\, \pi_{\mathrm{ref}}).
$$

The solution is:

$$
\pi^*(y)
\propto
\pi_{\mathrm{ref}}(y)\exp(r(y)/\beta).
$$

This equation is the whole psychological drama in miniature. The reward pulls.
The reference policy anchors. The temperature $$\beta$$ decides how expensive
movement is.

Small $$\beta$$ says: move hard toward high reward.

Large $$\beta$$ says: do not stray far from what the model already knew how to
say.

## DPO's Nice Trick

Direct Preference Optimization noticed that the KL-regularized optimum can be
rearranged.[^dpo] Ignoring the prompt notation for a moment:

$$
r(y)
=
\beta \log \frac{\pi^*(y)}{\pi_{\mathrm{ref}}(y)}
+ \beta \log Z.
$$

In a pairwise comparison, the partition term $$\beta \log Z$$ cancels. So for a
preferred answer $$y_w$$ and a rejected answer $$y_l$$, the reward difference
can be represented through policy log-ratios:

$$
r(y_w) - r(y_l)
=
\beta
\left[
\log \frac{\pi(y_w)}{\pi_{\mathrm{ref}}(y_w)}
-
\log \frac{\pi(y_l)}{\pi_{\mathrm{ref}}(y_l)}
\right].
$$

Plug that into a Bradley-Terry likelihood and the DPO loss appears:

$$
-\log \sigma\left(
\beta
\left[
\log \frac{\pi_\theta(y_w)}{\pi_{\mathrm{ref}}(y_w)}
-
\log \frac{\pi_\theta(y_l)}{\pi_{\mathrm{ref}}(y_l)}
\right]\right).
$$

That is the elegant part. DPO removes an explicit reward-model stage and avoids
the inner loop of reinforcement learning. Rafailov and collaborators report
that this simpler classification-like objective can match or improve PPO-based
RLHF in several settings while being substantially simpler to train.[^dpo]

But elegance can create a new hallucination in the engineer:

```text
if the loss is simple, the data problem must also be simple
```

It is not.

## A Preference Lens Lab

The lab below is a one-prompt toy universe. There are nine possible answers.
Each has a hidden true quality. The reference model is cautious, so it tends to
sample middle answers. Comparison data is collected either from that reference
distribution or from broader exploration. A finite DPO-style optimizer then
learns a policy through the relative log-ratio
$$\log \pi(y) - \log \pi_{\mathrm{ref}}(y)$$.

Try this sequence:

1. set **Exploration** near 0 and **Reference caution** high;
2. watch the best answer receive very few comparisons;
3. increase **Exploration**;
4. notice that the learned policy suddenly has evidence for the better region;
5. raise **Label noise** and watch the inferred reward lens bend.

<div class="pref-lab" data-pref-lab>
  <div class="pref-lab__controls">
    <label>
      Comparisons: <output data-value="pairs">320</output>
      <input type="range" min="40" max="1200" step="40" value="320" data-param="pairs">
    </label>
    <label>
      Exploration: <output data-value="exploration">35%</output>
      <input type="range" min="0" max="100" step="5" value="35" data-param="exploration">
    </label>
    <label>
      Label noise: <output data-value="labelNoise">8%</output>
      <input type="range" min="0" max="35" step="1" value="8" data-param="labelNoise">
    </label>
    <label>
      KL temperature beta: <output data-value="beta">0.80</output>
      <input type="range" min="25" max="250" step="5" value="80" data-param="beta">
    </label>
    <label>
      Reference caution: <output data-value="referenceCaution">68%</output>
      <input type="range" min="0" max="100" step="2" value="68" data-param="referenceCaution">
    </label>
    <label>
      Training steps: <output data-value="steps">240</output>
      <input type="range" min="40" max="520" step="20" value="240" data-param="steps">
    </label>
  </div>
  <div class="pref-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Preference optimization simulator showing policy mass, comparison coverage, training path, and learned reward lens"></canvas>
  <div class="pref-lab__legend">
    <span><i style="background:#64748b"></i> Reference policy</span>
    <span><i style="background:#0f766e"></i> Learned DPO-style policy</span>
    <span><i style="background:#7c3aed"></i> KL oracle from true reward</span>
    <span><i style="background:#2563eb"></i> True reward signal</span>
  </div>
  <p class="pref-lab__note">
    Deterministic toy model. It fits finite action log-ratios with the DPO
    pairwise loss and a small weight-decay anchor. The "oracle" curve uses the
    hidden reward, which real preference optimization does not get to see.
  </p>
</div>
<script src="{{ '/assets/js/preference-optimization-lab.js?v=20260613a' | relative_url }}"></script>

The upper panel is the policy. Gray is the reference model, green is the learned
policy, purple is the policy you would get if the hidden reward were known and
used in the KL-regularized objective. The blue line is the hidden true reward.

The lower-left panel is the comparison matrix. If the red-highlighted best
action has little coverage, the optimizer has no reason to move much probability
there. This is not a bug in DPO. It is a consequence of offline preference
learning. The loss cannot compare outputs that never appeared.

The lower-right panel plots the learned reward lens:

$$
\widehat{r}(y)
\approx
\beta
\log \frac{\pi(y)}{\pi_{\mathrm{ref}}(y)}.
$$

The estimate is best where there are comparisons. It is weak where the data is
thin. The point sizes encode coverage because in preference learning, evidence
is not uniformly spread across the output space.

## Three Levers That Look Like One

Preference tuning often gets described as "optimize for what humans prefer."
That hides three different levers.

The first lever is the reference policy. If the reference rarely samples a kind
of answer, then an offline preference dataset built from that reference may not
contain enough comparisons to learn whether that answer is good. This is a data
coverage problem, not merely an optimizer problem.

The second lever is $$\beta$$. In the KL objective, $$\beta$$ controls the price
of moving away from the reference. It is not just a numerical hyperparameter.
It is a statement about how much trust you place in the old model relative to
the preference signal.

The third lever is the labeling protocol. Pairwise labels are easier than scalar
rewards, but the choice of candidates, rubric, labeler pool, context window,
ordering, UI, and aggregation rule all become part of the learned object. If
labelers prefer long answers in ambiguous tasks, length can become a reward
feature. If the dataset rarely pairs concise correct answers against verbose
mediocre ones, the optimizer may not learn the distinction you care about.

Azar, Rowland, Piot, Guo, Calandriello, Valko, and Munos make this point from a
theoretical angle: practical preference-learning algorithms rely on
approximations that can be analyzed as special cases of more general pairwise
objectives, and those approximations have failure modes.[^azar]

## What DPO Did Not Promise

DPO did not promise to solve preference data.

It promised a simpler way to optimize a policy from preference data under a
particular KL-regularized view of the problem.

That is already valuable. Removing a reward-model training stage removes a
source of engineering complexity. Avoiding online RL can make training cheaper
and more stable. A direct pairwise loss is easier to implement, debug, and
scale.

But the old questions remain:

```text
Who generated the candidate answers?
Which pairs did labelers compare?
What rubric did they use?
Where is the reference policy too timid?
Where is it already too biased?
What behavior is absent from the preference data?
What changes when the trained policy leaves the data distribution?
```

The most important failures are often not inside the formula. They are in the
interface between the formula and the collection process.

## The Useful Mental Model

A preference optimizer is not a value oracle.

It is a lens:

```text
comparison data
through a reference policy
through a KL temperature
through a pairwise likelihood
through a finite model class
```

The resulting policy can be much better than the reference. It can also be
confidently shaped by a narrow comparison window.

This is why I like the phrase "preference optimization" more than "alignment"
for the training step itself. It is less grand and more accurate. We are not
summoning human values from a loss function. We are fitting a policy to a
particular measurement process.

That humility is not pessimism. It is a design discipline.

Better preference systems will come from better losses, yes, but also from
better candidate generation, active comparison selection, adversarial audits,
rubric design, uncertainty estimates, and post-training evaluations that look
for the places the comparison data did not illuminate.

The model learns the comparisons you show it.

Show it carefully.

## Notes

[^bradley-terry]: Ralph Allan Bradley and Milton E. Terry, ["Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons"](https://academic.oup.com/biomet/article-abstract/39/3-4/324/326091), *Biometrika*, 1952.

[^christiano]: Paul Christiano, Jan Leike, Tom B. Brown, Miljan Martic, Shane Legg, and Dario Amodei, ["Deep reinforcement learning from human preferences"](https://arxiv.org/abs/1706.03741), 2017.

[^ziegler]: Daniel M. Ziegler, Nisan Stiennon, Jeffrey Wu, Tom B. Brown, Alec Radford, Dario Amodei, Paul Christiano, and Geoffrey Irving, ["Fine-Tuning Language Models from Human Preferences"](https://arxiv.org/abs/1909.08593), 2019.

[^instructgpt]: Long Ouyang et al., ["Training language models to follow instructions with human feedback"](https://arxiv.org/abs/2203.02155), 2022.

[^dpo]: Rafael Rafailov, Archit Sharma, Eric Mitchell, Stefano Ermon, Christopher D. Manning, and Chelsea Finn, ["Direct Preference Optimization: Your Language Model is Secretly a Reward Model"](https://arxiv.org/abs/2305.18290), 2023.

[^azar]: Mohammad Gheshlaghi Azar, Mark Rowland, Bilal Piot, Daniel Guo, Daniele Calandriello, Michal Valko, and Remi Munos, ["A General Theoretical Paradigm to Understand Learning from Human Preferences"](https://arxiv.org/abs/2310.12036), 2023.
