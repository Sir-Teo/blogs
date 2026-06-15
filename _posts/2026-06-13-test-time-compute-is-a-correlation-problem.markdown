---
layout: post
title: "Thirty-Two Tries Can Be One Mistake"
description: "Repeated reasoning samples buy intelligence only when attempts are diverse, the selector is reliable, and the system knows when not to answer."
date: 2026-06-13 00:05:00 -0400
categories: ai-systems
tags: [test-time-compute, reasoning, llms, statistics, verification, calibration]
excerpt: "The naive pass@k formula assumes independent attempts and an oracle selector. Real reasoning attempts share mistakes. The useful unit is independent, selectable evidence."
---

The simplest story about test-time compute is intoxicating. If a language model
gets one try at a math problem, code task, proof, or planning question, maybe it
fails. Give it 32 tries, pick the best answer, and suddenly the same model looks
much smarter.

This is not just folklore. Chain-of-thought prompting made intermediate
reasoning visible.[^cot] Self-consistency showed that sampling multiple
reasoning paths and voting over answers can improve arithmetic and commonsense
reasoning.[^self-consistency] GSM8K and HumanEval made repeated sampling feel
especially natural because final answers can often be checked by verifiers or
unit tests.[^gsm8k], [^codex] More recent work studies inference compute as a
scaling axis in its own right, from repeated sampling over huge budgets to
compute-optimal allocation by problem difficulty.[^monkeys], [^snell]

The tempting mental model is:

$$
\Pr(\text{solve with } n \text{ tries})
=
1 - (1-p)^n,
$$

where $$p$$ is the probability that one sample is correct. If $$p=0.20$$, then
32 independent tries give oracle coverage above 99.9%. That little formula is
why test-time compute can feel like magic.

The formula is also where many bad forecasts begin.

<div class="callout">
  <strong>Thesis:</strong> test-time compute works when extra samples provide
  extra independent evidence. If attempts share the same blind spots, repeated
  sampling buys less than the pass@k curve suggests. The scarce resource is not
  tokens. It is decorrelated, selectable reasoning.
</div>

This post is not a complaint about inference scaling. I think the direction is
central. It is a warning about the unit of account. Counting samples is easy.
Counting effective samples is the hard part.

## The Beautiful Lie of pass@k

For code, formal proofs, and some math settings, the best case is unusually
clean. Generate $$n$$ candidates, run a trustworthy checker, and accept the first
one that passes. The checker does not need to understand the model's reasoning.
It only needs to verify the final artifact.

That is why pass@k became so useful in code generation. The Codex paper reported
both single-sample performance and pass@k, and it used an estimator that corrects
for drawing $$k$$ samples from a finite set of generated candidates.[^codex]
Repeated sampling is especially attractive when verification is cheap and
nearly exact.

The oracle setting separates two questions:

1. Did the generator ever produce a correct solution?
2. Can the system identify it?

For unit-tested code, the second question is often easy enough to make the first
question the main bottleneck. For open-ended reasoning, the second question can
be the whole game.

## Same Blind Spot, More Tokens

Language model samples are not independent workers. They are draws from the
same model, prompted by the same problem, with the same training scars and often
the same misleading surface cues. Raising temperature may diversify wording
without diversifying the underlying mistake.

A better toy model is exchangeable rather than independent. For each problem,
imagine a latent success probability $$\theta$$. Easy problems have high
$$\theta$$. Trap problems have low $$\theta$$. Conditional on $$\theta$$, samples
are independent:

$$
Y_i \mid \theta \sim \text{Bernoulli}(\theta).
$$

But unconditionally, attempts on the same problem are correlated because they
share $$\theta$$. The single-sample solve rate is still

$$
p = \mathbb{E}[\theta],
$$

while oracle coverage is

$$
\Pr(\max_i Y_i = 1)
=
1 - \mathbb{E}\left[(1-\theta)^n\right].
$$

The mean $$p$$ is no longer enough. Two models can have the same pass@1 and very
different pass@32. One spreads probability evenly across problems; another
solves some problems almost always and fails others almost always. The first
scales with sampling. The second plateaus.

Survey sampling has a useful analogy. Correlated observations have a smaller
effective sample size than their raw count. A common design-effect intuition is

$$
n_{\text{eff}}
\approx
\frac{n}{1 + (n-1)\rho},
$$

where $$\rho$$ is an intraclass correlation.[^kish] The formula is not a theorem
about LLM reasoning, but the warning transfers perfectly: 64 highly correlated
samples may behave like far fewer independent samples.

## The Crowd Can Agree on the Trap

Self-consistency works when different correct reasoning paths converge on the
same answer, while wrong paths scatter. That is a beautiful condition. It is
also a condition, not a law of nature.

If wrong answers are diffuse, plurality voting is a useful denoiser. If wrong
answers collapse onto the same seductive trap, voting amplifies the trap. Many
math and coding failures have exactly this shape: an off-by-one convention, a
misread quantifier, a bogus algebraic cancellation, an unstated assumption, or a
test suite that misses the edge case.

Verifiers help because they change the selection problem. Cobbe et al. trained
verifiers for math word problems and used them to choose among many candidate
solutions.[^gsm8k] Lightman et al. later compared outcome supervision with
process supervision, finding that step-level feedback can train stronger reward
models for mathematical reasoning.[^lightman] Snell et al. analyze test-time
compute through search against dense process-based verifier reward models and
adaptive strategies, emphasizing that the best allocation depends on problem
difficulty.[^snell]

But a verifier is not an oracle. As $$n$$ grows, the system sees more correct
candidates and more attractive wrong candidates. If the verifier has a false
positive tail, large sample budgets eventually find it.

This is the same statistical shape as multiple testing. More tries increase
opportunity. They also increase selection pressure on whatever scoring function
chooses the final answer.

## A Small Trap Factory

The simulator below generates synthetic reasoning problems. Each problem has a
latent difficulty, so samples from the same problem are correlated. Wrong
answers can either scatter across many mistakes or collapse onto a common trap.
A noisy verifier scores candidates with imperfect separation between correct and
incorrect solutions.

The chart compares four policies:

- one sample, no extra compute;
- majority vote over sampled final answers;
- verifier selection with abstention when the top score is weak;
- an oracle checker that accepts if any sample is correct.

The oracle is not meant to be realistic for open-ended tasks. It is an upper
bound: how much coverage the generator produced before selection errors.

<div class="sampling-lab" data-sampling-lab>
  <div class="sampling-lab__controls">
    <label>
      Samples: <output data-value="samples">32</output>
      <input type="range" min="1" max="256" value="32" data-param="samples">
    </label>
    <label>
      Pass@1: <output data-value="pass1">28%</output>
      <input type="range" min="5" max="75" value="28" data-param="pass1">
    </label>
    <label>
      Shared difficulty: <output data-value="correlation">35%</output>
      <input type="range" min="0" max="85" value="35" data-param="correlation">
    </label>
    <label>
      Wrong-answer clustering: <output data-value="traps">45%</output>
      <input type="range" min="0" max="90" value="45" data-param="traps">
    </label>
    <label>
      Verifier separation: <output data-value="verifier">68%</output>
      <input type="range" min="20" max="95" value="68" data-param="verifier">
    </label>
  </div>
  <div class="sampling-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="360" aria-label="Synthetic test-time compute outcomes by selection policy"></canvas>
  <div class="sampling-lab__legend">
    <span><i style="background:#0f766e"></i> Correct answer</span>
    <span><i style="background:#b45309"></i> Wrong accepted</span>
    <span><i style="background:#64748b"></i> Abstain or no solve</span>
  </div>
  <p class="sampling-lab__note">
    Deterministic simulation, 900 synthetic problems. The beta-binomial
    difficulty model keeps pass@1 fixed while changing same-problem correlation.
  </p>
</div>
<script defer src="{{ '/assets/js/sampling-lab.js' | relative_url }}"></script>

Try raising samples while shared difficulty and wrong-answer clustering are
high. The oracle curve may still improve, but majority voting can plateau or
select the trap. Try improving verifier separation. Selection matters as much
as generation: a better verifier converts coverage into accuracy and turns weak
evidence into abstention instead of a confident mistake.

The most important slider is shared difficulty. When correlation is low, the
classic $$1-(1-p)^n$$ intuition is not crazy. When correlation is high, raw
sample count overstates compute. The model is not trying the problem 64 new
ways. It is often trying the same family of thoughts 64 times.

## Metrics That Separate Search From Selection

A serious test-time compute evaluation should report more than pass@1 and final
accuracy.

1. Oracle coverage: did any sample contain a correct solution?
2. Selection accuracy: conditional on a correct sample existing, did the system
   pick it?
3. False acceptance rate: conditional on no correct sample existing, did the
   system still answer?
4. Diversity of answer basins, not just diversity of wording.
5. Marginal gain per doubling of samples.
6. Calibration of verifier scores under larger candidate pools.
7. Accuracy-coverage curves when the system is allowed to abstain.
8. Performance by problem difficulty, because easy and impossible problems
   hide the interesting middle.

The accuracy-coverage view matters because abstention is part of a reliable
reasoning system. Selective classification formalizes this tradeoff: a model can
reject some inputs in order to guarantee lower risk on the inputs it does
answer.[^selective] Test-time compute systems should be evaluated in the same
spirit. "I do not know" is not a failure if the alternative is a polished wrong
answer.

## Design for Different Mistakes

The engineering prescription is not "sample less." It is more precise.

First, diversify the generator in ways that attack shared failure modes. Change
decompositions, tools, scratchpads, retrieval context, and solution strategies,
not just temperature. Diversity that only changes prose is cosmetic.

Second, train selectors against the candidate pool they will actually see. A
verifier calibrated for 4 candidates may be miscalibrated for 256 candidates
because the maximum wrong score gets larger with search.

Third, allocate compute adaptively. Snell et al.'s compute-optimal framing is
important because samples spent on already-solved or hopeless prompts have low
marginal value.[^snell] The middle of the difficulty distribution is where extra
attempts are most useful.

Fourth, keep the oracle curve and the deployed curve separate. If oracle
coverage rises but deployed accuracy does not, the bottleneck is selection. If
neither rises, the bottleneck is generator diversity or problem representation.

Finally, measure correlated failure directly. Cluster prompts by topic,
template, latent skill, and observed wrong-answer basin. If many samples fail in
the same way, the next unit of compute should probably not be another sample
from the same distribution.

## Inference Portfolios

The direction I find most promising is inference portfolios.

Instead of asking one model for $$n$$ iid-looking completions, build a portfolio
of deliberately different inference procedures:

$$
\Pi = \{\pi_1, \pi_2, \ldots, \pi_m\}.
$$

Each procedure has a cost, a success profile, and a correlation profile with the
others. The allocation problem is:

$$
\max_{a_1,\ldots,a_m}
\quad
\Pr(\text{correct selected answer})
\quad
\text{subject to}
\quad
\sum_j c_j a_j \le B.
$$

The missing ingredient is a practical estimator for the covariance matrix of
failure modes. Once you know which procedures fail together, you can buy
diversity instead of buying more tokens.

This connects test-time compute to ensemble learning, portfolio theory, survey
sampling, and selective prediction. The object is not just an answer. It is a
set of attempts whose errors are different enough that a selector can learn from
their disagreement.

## What Goes on the Dashboard

Test-time compute is real. Repeated sampling, search, self-consistency, and
verifiers can turn a fixed model into a stronger system.

But the naive pass@k curve describes independent attempts and an oracle
selector. Real reasoning samples are correlated. Real verifiers have tails. Real
wrong answers cluster.

The practical question is therefore not:

> How many samples did we buy?

It is:

> How much independent, selectable evidence did those samples create?

That is the unit that should go on the dashboard.

## Source Notes

[^cot]: Jason Wei et al., ["Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"](https://arxiv.org/abs/2201.11903), NeurIPS 2022.

[^self-consistency]: Xuezhi Wang et al., ["Self-Consistency Improves Chain of Thought Reasoning in Language Models"](https://arxiv.org/abs/2203.11171), ICLR 2023.

[^gsm8k]: Karl Cobbe et al., ["Training Verifiers to Solve Math Word Problems"](https://arxiv.org/abs/2110.14168), 2021.

[^codex]: Mark Chen et al., ["Evaluating Large Language Models Trained on Code"](https://arxiv.org/abs/2107.03374), 2021.

[^monkeys]: Bradley Brown et al., ["Large Language Monkeys: Scaling Inference Compute with Repeated Sampling"](https://arxiv.org/abs/2407.21787), 2024.

[^snell]: Charlie Snell, Jaehoon Lee, Kelvin Xu, and Aviral Kumar, ["Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters"](https://arxiv.org/abs/2408.03314), ICLR 2025.

[^kish]: Leslie Kish, *Survey Sampling*, Wiley, 1965.

[^lightman]: Hunter Lightman et al., ["Let's Verify Step by Step"](https://arxiv.org/abs/2305.20050), 2023.

[^selective]: Yonatan Geifman and Ran El-Yaniv, ["Selective Classification for Deep Neural Networks"](https://arxiv.org/abs/1705.08500), 2017.
