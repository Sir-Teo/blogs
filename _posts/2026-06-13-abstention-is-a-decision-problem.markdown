---
layout: post
title: "Abstention Is a Decision Problem"
description: "A model should not answer merely because its confidence cleared a universal threshold. The right stop rule depends on error costs, abstention costs, and the value of more information."
date: 2026-06-13 00:25:00 -0400
categories: ai-systems
tags: [selective-prediction, abstention, decision-theory, value-of-information, calibration]
excerpt: "Selective prediction is usually drawn as a risk-coverage curve. In deployed AI systems it is also a utility problem: act, abstain, defer, or buy more evidence."
---

Most machine learning systems are trained to answer. Production systems need a
second skill: knowing when not to.

That sounds like calibration. It is partly calibration. A model that cannot rank
its own errors is dangerous. But abstention is not merely a confidence threshold.
It is a decision about consequences. The same probability of being wrong means
different things when the action is tagging a photo, approving a trade, denying
credit, escalating a security alert, or giving medical advice.

The older literature knew this before neural networks existed. Chow's reject
option framed recognition as statistical decision theory: a classifier may
accept a label or reject the case for exceptional handling, and the optimal rule
depends on posterior probabilities and costs.[^chow1957], [^chow1970] Modern
selective classification gives this a clean learning-theoretic vocabulary:
coverage is how often the system answers; selective risk is the error rate on
the answered subset; the frontier between them is the risk-coverage tradeoff.[^elyaniv]

Deep learning rediscovered the same shape under new pressure. Geifman and
El-Yaniv showed how to equip neural networks with selective prediction rules at
a desired risk level, and later proposed SelectiveNet, which learns prediction
and rejection jointly rather than bolting rejection on afterward.[^selective-dnn],
[^selectivenet]

<div class="callout">
  <strong>Thesis:</strong> abstention is not a failure mode. It is an action.
  The right policy compares answering, abstaining, deferring, and computing
  longer in units of expected utility, not in units of raw confidence.
</div>

This is why "only answer when confidence is above 90%" is not a general safety
rule. It hides the part of the problem that actually matters: what happens if
the model is wrong, what happens if it says nothing, and what other evidence can
still be bought.

## Confidence Is Not Utility

Suppose a model predicts an action and estimates that it has error probability
$$r(x)$$. Let a correct action produce benefit $$B$$, a wrong action cost $$L$$,
and abstention cost $$A$$. Acting has estimated utility

$$
U_{\text{act}}(x) = (1-r(x))B - r(x)L,
$$

while abstaining has utility

$$
U_{\text{abstain}} = -A.
$$

The decision boundary is therefore

$$
r(x) \leq \frac{B + A}{B + L}.
$$

If errors are cheap, the model should answer even when it is not very sure. If
errors are catastrophic, it should abstain at error probabilities that would be
perfectly acceptable elsewhere. This boundary is not a property of the model
alone. It is a property of the model embedded in a decision problem.

Franc, Prusa, and Voracek make this point in a modern unified treatment of
reject-option classifiers: cost-based, bounded-risk, and bounded-coverage
versions all lead back to selection rules ordered by conditional expected
risk.[^optimal-reject] A good uncertainty score is useful because it preserves
that ordering. It is not useful because "uncertainty" is intrinsically sacred.

## Risk-Coverage Curves Are Not Enough

Risk-coverage curves are the right first picture. Sort examples from easiest to
hardest according to an uncertainty score. Answer the easy ones. Reject the hard
ones. As coverage falls, risk on the answered subset should improve.

That curve is elegant because it separates discrimination from deployment. It
asks: can the system put likely mistakes later in the queue? A badly calibrated
model can still have a useful risk-coverage curve if its ranking of easy versus
hard cases is good. A numerically calibrated model can still be operationally
weak if the risk curve is flat.

But a deployment policy needs more than a curve:

- What is the cost of a false positive versus a false negative?
- Is abstention a cheap no-op, an expensive human review, or a lost opportunity?
- Does the system have another action, such as retrieving more context, running
  more samples, asking a verifier, or escalating to a specialist?
- Does extra computation help uniformly, or mainly on a narrow band of cases?

The last question is the bridge to value of information. Howard's information
value theory asks how much a decision-maker should pay to reduce uncertainty
before acting.[^howard] Russell and Wefald brought the same idea into AI as
rational metareasoning: computation itself is an action with costs and expected
benefits.[^russell]

That is the missing layer in many LLM and agent systems. "Answer or abstain" is
already a decision problem. "Think longer or stop" is the same problem one level
up.

## A Small Experiment

The simulator below creates synthetic binary decisions. Each case has a true
probability that the base model's proposed action is correct. The model observes
a noisy estimate of its own error probability. Extra computation can improve the
answer and the error estimate, but it costs resources and helps most in the
middle: easy cases do not need it, and some hard cases are traps.

The chart compares five policies:

- always answer;
- a fixed confidence cutoff;
- a selective-risk rule calibrated to a target answered-risk;
- a cost-aware rule that compares action utility with abstention utility;
- a value-of-information rule that computes longer only when the estimated
  improvement is worth its cost.

<div class="abstention-lab" data-abstention-lab>
  <div class="abstention-lab__controls">
    <label>
      Target answered risk: <output data-value="targetRisk">8%</output>
      <input type="range" min="2" max="25" value="8" data-param="targetRisk">
    </label>
    <label>
      Error cost: <output data-value="errorCost">6.0</output>
      <input type="range" min="10" max="200" value="60" data-param="errorCost">
    </label>
    <label>
      Abstention cost: <output data-value="abstainCost">0.35</output>
      <input type="range" min="0" max="200" value="35" data-param="abstainCost">
    </label>
    <label>
      Compute cost: <output data-value="computeCost">0.18</output>
      <input type="range" min="0" max="120" value="18" data-param="computeCost">
    </label>
    <label>
      Score quality: <output data-value="scoreQuality">70%</output>
      <input type="range" min="20" max="95" value="70" data-param="scoreQuality">
    </label>
    <label>
      Extra compute value: <output data-value="computeValue">55%</output>
      <input type="range" min="0" max="95" value="55" data-param="computeValue">
    </label>
  </div>
  <div class="abstention-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="420" aria-label="Utility and risk coverage for abstention policies"></canvas>
  <div class="abstention-lab__legend">
    <span><i style="background:#0f766e"></i> Mean utility</span>
    <span><i style="background:#b45309"></i> Answered risk</span>
    <span><i style="background:#2563eb"></i> Target risk</span>
  </div>
  <p class="abstention-lab__note">
    Deterministic simulation, 1,600 test cases and a separate calibration set.
    Utility is per case: correct answers gain 1, wrong answers lose the selected
    error cost, abstentions pay the selected abstention cost, and extra
    computation pays the selected compute cost.
  </p>
</div>
<script defer src="{{ '/assets/js/abstention-lab.js' | relative_url }}"></script>

Try raising the error cost. The cost-aware policy becomes more conservative
without changing the model. Try raising the abstention cost. The same model now
answers more often because silence has become expensive. Lower score quality and
watch selective risk become harder to control: abstention depends on ranking
mistakes before they happen.

The value-of-information policy is deliberately modest. It does not spend more
compute on every hard case. It spends compute where the estimated post-compute
decision is likely to cross a utility boundary. This is the operational version
of "think longer": not more tokens everywhere, but more evidence where the
evidence can change the action.

## The Design Pattern

For an AI system that can harm users, money, or trust, I would not ship a single
confidence threshold. I would ship a small decision policy:

1. Estimate the conditional risk of the proposed action.
2. Estimate the utility of acting, abstaining, deferring, and computing longer.
3. Calibrate those estimates on held-out data that resembles deployment.
4. Report coverage, selective risk, utility, compute rate, and subgroup slices.
5. Recalibrate when the population, action set, or cost model changes.

The cost model does not need to be perfect to be useful. The point is to make it
explicit. A hidden cost model is still a cost model; it is just harder to audit.

Learning-to-defer research is pushing this idea toward human-AI teams. Recent
benchmarks emphasize that deferral policies depend on expert quality, capacity,
and heterogeneity, not just on model confidence.[^l2d] That should sound obvious
to anyone who has seen a real operations queue. It is also exactly why the
abstention problem cannot be solved inside the softmax layer.

## A Research Direction

The next interesting frontier is not merely "better uncertainty." It is
decision-calibrated uncertainty for agentic systems.

An agent does not have one reject option. It has many possible pauses: retrieve,
sample again, run a verifier, ask a human, narrow the action, defer execution,
hedge the position, or refuse. Each pause has a cost. Each cost depends on the
state. Each state is changing because the agent's own computations reveal
information.

That suggests a practical research program:

- learn risk scores that preserve the ordering of conditional loss, not just
  probability calibration;
- learn compute-value scores that predict when additional reasoning changes the
  final decision;
- evaluate policies by utility under explicit cost models, not just accuracy;
- stress-test under shifted costs, shifted populations, and limited human
  capacity;
- expose the cost model in logs so the system can be audited after failures.

Abstention is sometimes framed as humility. That is emotionally right, but
technically incomplete. A system abstains well when it has learned the economics
of being wrong, being silent, and buying one more piece of evidence.

## Notes

[^chow1957]: C. K. Chow, "An Optimum Character Recognition System Using Decision Functions," *IRE Transactions on Electronic Computers*, 1957. [PDF](https://gwern.net/doc/ai/highleyman/1957-chow.pdf).

[^chow1970]: C. K. Chow, "On Optimum Recognition Error and Reject Tradeoff," *IEEE Transactions on Information Theory*, 1970. [DOI summary](https://research.amanote.com/publication/n5s33HMBKQvf0Bhi5VbF/on-optimum-recognition-error-and-reject-tradeoff).

[^elyaniv]: Ran El-Yaniv and Yair Wiener, "On the Foundations of Noise-free Selective Classification," *Journal of Machine Learning Research*, 2010. [JMLR](https://jmlr.org/papers/v11/el-yaniv10a.html).

[^selective-dnn]: Yonatan Geifman and Ran El-Yaniv, "Selective Classification for Deep Neural Networks," NeurIPS 2017. [Proceedings](https://proceedings.neurips.cc/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html).

[^selectivenet]: Yonatan Geifman and Ran El-Yaniv, "SelectiveNet: A Deep Neural Network with an Integrated Reject Option," ICML 2019. [PMLR](https://proceedings.mlr.press/v97/geifman19a.html).

[^optimal-reject]: Vojtech Franc, Daniel Prusa, and Vaclav Voracek, "Optimal Strategies for Reject Option Classifiers," *Journal of Machine Learning Research*, 2023. [PDF](https://jmlr.org/papers/volume24/21-0048/21-0048.pdf).

[^howard]: Ronald A. Howard, "Information Value Theory," *IEEE Transactions on Systems Science and Cybernetics*, 1966. [NASA ADS](https://ui.adsabs.harvard.edu/abs/1966ITSSC...2...22H/abstract).

[^russell]: Stuart Russell, "Rationality and Intelligence," IJCAI Computers and Thought Award Lecture, 1995; see also Russell and Wefald's work on rational metareasoning. [PDF](https://www.ijcai.org/Proceedings/95-1/Papers/122.pdf).

[^l2d]: Jean V. Alves et al., "A benchmarking framework and dataset for learning to defer in human-AI decision-making," *Scientific Data*, 2025. [Project page](https://research.feedzai.com/publication/a-benchmarking-framework-and-dataset-for-learning-to-defer-in-human-ai-decision-making/).
