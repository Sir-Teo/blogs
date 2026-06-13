---
layout: post
title: "The Judge Has a Seat Number"
description: "LLM-as-judge evaluation is not just a model call. It is a measurement protocol with position effects, verbosity effects, calibration choices, and sampling uncertainty."
date: 2026-06-13 09:06:00 -0400
categories: machine-learning
tags: [llm-evaluation, llm-as-judge, benchmarks, measurement, bias, leaderboards, model-evaluation]
excerpt: "A judge model can be useful and biased at the same time. The question is not whether to use it, but whether the evaluation protocol measures the model or the seat it was given."
---

An LLM judge looks like a shortcut.

Give it a prompt, two candidate answers, and a rubric. Ask which answer is
better. Repeat a few thousand times. Turn the wins into a leaderboard. Ship the
model that wins.

This is much cheaper than human evaluation. It is faster than waiting for
product metrics. It scales across drafts, checkpoints, prompts, and ablations.
It also has a peculiar failure mode:

```text
the judge is part of the experiment
```

Not just the model used as judge. The whole protocol: which candidate appears
first, how long the answers are, how the rubric is phrased, whether positions
are swapped, whether ties are allowed, which prompts are sampled, and whether
the final statistic controls for known nuisance variables.

A leaderboard can measure ability.

It can also measure seat order.

## The Good News

The good news is real.

Zheng and collaborators introduced MT-Bench and Chatbot Arena as practical ways
to evaluate open-ended chat assistants, and they studied strong LLMs as judges
for these comparisons.[^mtbench] Their headline result was not "LLM judges are
perfect." It was more interesting: strong judges such as GPT-4 showed agreement
with human preferences at roughly the same level humans agree with one another,
while the authors also documented position, verbosity, self-enhancement, and
reasoning limitations.

G-Eval pushed a related idea for natural-language-generation evaluation: use a
large model, explicit criteria, chain-of-thought-style evaluation steps, and a
form-filling score.[^geval] Chatbot Arena showed that large-scale pairwise human
votes can produce useful model rankings in the wild, with randomized anonymous
battles and statistical ranking methods.[^arena]

This is a major practical advance. Open-ended generation is hard to score with
exact-match metrics. BLEU, ROUGE, pass/fail tests, and multiple-choice accuracy
only cover parts of the surface. If a judge model can cheaply approximate human
preferences for many tasks, it becomes an evaluation microscope.

But microscopes have optics.

## Pairwise Evaluation Is a Statistical Instrument

In the clean version, there is a prompt $$x$$ and two answers $$a$$ and $$b$$.
The latent human preference is:

$$
P(a \succ b \mid x)
=
\sigma(u(x,a) - u(x,b)).
$$

The judge does not observe $$u$$. It observes text and produces a decision.
A more honest sketch is:

$$
\mathrm{logit}\,P_J(a \succ b)
=
\alpha[u(x,a)-u(x,b)]
+ \gamma[\ell(a)-\ell(b)]
+ \delta\,\mathbf{1}\{a\text{ shown first}\}
+ \eta\,s(a,b,x).
$$

Here $$\ell$$ is length, $$\delta$$ is position bias, and $$s$$ stands for
style, familiarity, rubric interpretation, or other judge-specific signals. The
point is not that this exact equation is true. The point is that "judge says A"
is not the same object as "human utility of A."

Wang and collaborators made the position problem vivid in *Large Language
Models are not Fair Evaluators*: changing the order of candidate answers could
substantially alter the result, and the paper proposed balanced position
calibration among other mitigations.[^faireval] Later work has continued to
measure position bias systematically across judges and tasks.[^position]

Length is another nuisance variable. AlpacaEval is useful precisely because it
is cheap and validated against human judgments, but its authors also emphasize
that automatic evaluators can favor longer outputs. Length-Controlled
AlpacaEval treats this as an adjustment problem and reports a debiased win rate
that is more robust to verbosity gaming.[^alpaca-lc]

The moral is not "never use judge models."

The moral is:

```text
treat judge outputs as measurements, not ground truth
```

## A Judge-Protocol Lab

The toy lab below has six fictional models. Each has hidden task ability,
average answer length, and style. A synthetic "human" compares answers using
hidden quality. A synthetic LLM judge compares the same answers, but it may also
prefer the first seat, longer answers, or a familiar style.

Four leaderboards are shown:

- **human**: the hidden preference target in the toy world;
- **raw**: one judge call with random answer order;
- **swap**: average the pair after swapping answer positions;
- **length-control**: swap positions and remove the fitted length slope from
  judge logits.

Try raising **Position bias**. Then raise **Close-pair sampling**. Position
bias is most damaging when candidates are close, because a small seat effect can
decide the comparison. Next raise **Verbosity bias** and watch the longer models
gain raw judge credit. The length-control curve can help, but it is not magic:
if length is genuinely correlated with quality in a task, removing it can also
remove real signal.

<div class="judge-lab" data-judge-lab>
  <div class="judge-lab__controls">
    <label>
      Prompts: <output data-value="prompts">240</output>
      <input type="range" min="60" max="640" step="20" value="240" data-param="prompts">
    </label>
    <label>
      Position bias: <output data-value="positionBias">22%</output>
      <input type="range" min="0" max="65" step="1" value="22" data-param="positionBias">
    </label>
    <label>
      Verbosity bias: <output data-value="verbosityBias">30%</output>
      <input type="range" min="0" max="80" step="1" value="30" data-param="verbosityBias">
    </label>
    <label>
      Style familiarity: <output data-value="selfStyleBias">12%</output>
      <input type="range" min="0" max="45" step="1" value="12" data-param="selfStyleBias">
    </label>
    <label>
      Judge noise: <output data-value="judgeNoise">16%</output>
      <input type="range" min="0" max="45" step="1" value="16" data-param="judgeNoise">
    </label>
    <label>
      Task mix: <output data-value="taskMix">42% writing</output>
      <input type="range" min="10" max="80" step="2" value="42" data-param="taskMix">
    </label>
    <label>
      Close-pair sampling: <output data-value="closeOnly">0%</output>
      <input type="range" min="0" max="100" step="5" value="0" data-param="closeOnly">
    </label>
  </div>
  <div class="judge-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="LLM judge evaluation simulator showing leaderboards, position bias, verbosity residuals, and pairwise judge-human error"></canvas>
  <div class="judge-lab__legend">
    <span><i style="background:#0f766e"></i> Human target</span>
    <span><i style="background:#be123c"></i> Raw judge</span>
    <span><i style="background:#2563eb"></i> Position swapped</span>
    <span><i style="background:#7c3aed"></i> Length controlled</span>
  </div>
  <p class="judge-lab__note">
    Deterministic toy model. The length-control panel residualizes judge logits
    against answer-length differences after position swapping. That is a
    diagnostic, not a claim that length should always be removed.
  </p>
</div>
<script src="{{ '/assets/js/judge-seat-lab.js?v=20260613a' | relative_url }}"></script>

The first thing to notice is that swapping positions is not a detail. If a judge
has even a modest first-seat preference, a single-order evaluation leaks prompt
format into the result. Swapping positions does not solve every bias, but it
turns a directional seat effect into something visible.

The second thing to notice is that bias is not constant across the leaderboard.
The seat-audit panel bins comparisons by hidden quality gap. When two answers
are far apart, the better answer usually wins despite the seat. When they are
close, the seat can become the experiment.

That is why "we randomized order" is weaker than it sounds. Randomization makes
the estimator unbiased in expectation if enough samples are collected and
nothing else changes. It does not guarantee that one finite leaderboard is
stable, and it does not tell you which examples were decided by nuisance
signals.

## Why Agreement Is Not Enough

Suppose an LLM judge agrees with humans 80 percent of the time. That can be
excellent. It can also hide the exact question a model developer cares about.

Aggregate agreement can be high because easy comparisons dominate the test set.
The hard part is often the frontier:

```text
two strong models
same prompt
different tradeoffs
small quality gap
high product importance
```

A judge can agree on easy pairs and still be unreliable on frontier pairs. This
is why meta-evaluation matters. LLMBar, for example, was designed to test
whether LLM evaluators can distinguish instruction-following outputs from
deceptively appealing alternatives.[^llmbar] Verifiable-instruction benchmarks
such as IFEval take a different route: avoid subjective judging where possible
and test instructions with mechanically checkable constraints.[^ifeval]

The lesson is not that subjective evaluation is bad. Many important properties
are subjective: helpfulness, clarity, appropriateness, taste, conversational
flow. The lesson is that subjective evaluation needs controls.

## A Short Audit Checklist

Before trusting an LLM-judge leaderboard, I want to know:

- Were answer positions swapped and aggregated?
- Are ties allowed, or is every close case forced into a win/loss?
- Was verbosity measured, reported, and stress-tested?
- Is the judge prompted with a rubric or only a vague preference question?
- Are prompts sampled from the deployment distribution or a benchmark habit?
- Are results reported with uncertainty intervals?
- Are close comparisons separately analyzed?
- Is there a small human audit set, especially where judge protocols disagree?
- Does the ranking survive a different judge model?
- Are there mechanically verifiable subtasks that should not use a judge?

The most useful evaluation stacks are plural. Use unit tests where the property
is formal. Use reference-free LLM judges where human preference is the target
and scale matters. Use human audits where errors are costly, close, or strange.
Use product telemetry when real users are the only relevant distribution.

No single evaluator deserves sovereignty.

## The Measurement Mindset

The phrase "LLM-as-a-judge" is a little too person-shaped. It encourages us to
ask whether the judge is wise, fair, or smart.

A better phrase would be:

```text
LLM-mediated measurement protocol
```

That phrase is clunkier, but it keeps the right objects in view. A protocol has
sampling rules, nuisance variables, calibration procedures, uncertainty, failure
modes, and external validity limits.

The judge has a model name.

It also has a seat number.

If the seat number can change the result, it belongs in the experiment log.

## Notes

[^mtbench]: Lianmin Zheng et al., ["Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"](https://arxiv.org/abs/2306.05685), 2023. The paper studies LLM judges for open-ended chat evaluation and discusses position, verbosity, self-enhancement, and reasoning limitations.

[^geval]: Yang Liu, Dan Iter, Yichong Xu, Shuohang Wang, Ruochen Xu, and Chenguang Zhu, ["G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment"](https://arxiv.org/abs/2303.16634), 2023. [ACL Anthology](https://aclanthology.org/2023.emnlp-main.153/).

[^arena]: Wei-Lin Chiang et al., ["Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference"](https://arxiv.org/abs/2403.04132), 2024.

[^faireval]: Peiyi Wang et al., ["Large Language Models are not Fair Evaluators"](https://arxiv.org/abs/2305.17926), 2023.

[^position]: Lin Shi, Chiyu Ma, Wenhua Liang, Weicheng Ma, and Soroush Vosoughi, ["Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge"](https://arxiv.org/abs/2406.07791), 2024.

[^alpaca-lc]: Yann Dubois, Balazs Galambosi, Percy Liang, and Tatsunori B. Hashimoto, ["Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators"](https://arxiv.org/abs/2404.04475), 2024.

[^llmbar]: Guohang Zeng et al., ["Evaluating Large Language Models at Evaluating Instruction Following"](https://openreview.net/forum?id=tr0KidwPLc), ICLR 2024. Project repository: [LLMBar](https://github.com/princeton-nlp/LLMBar).

[^ifeval]: Jeffrey Zhou et al., ["Instruction-Following Evaluation for Large Language Models"](https://arxiv.org/abs/2311.07911), 2023.
