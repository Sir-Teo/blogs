---
layout: post
title: "Metrics Become Control Surfaces"
description: "Metrics fail under pressure because selection, gaming, and feedback change the data-generating process that made the metric useful."
date: 2026-06-13 00:15:00 -0400
categories: statistics
tags: [goodharts-law, metrics, causal-inference, ai-safety, statistics, psychology]
excerpt: "A metric is a sensor until it gets power. Then selection, gaming, and feedback can turn the proxy into a control surface detached from the thing we wanted."
---

Goodhart's law is usually quoted like a proverb: when a measure becomes a
target, it stops being a good measure. The line is memorable because it feels
unreasonably universal. Central banks, schools, sales teams, recommendation
systems, research labs, hospitals, trading desks, and reinforcement-learning
agents all find ways to make a number look better while the world underneath
does not improve.

The proverb is useful. It is also too compressed. It makes metric failure sound
like a moral defect: people cheat, institutions game, models exploit loopholes.
Sometimes that is true. But many Goodhart failures happen without villainy. They
come from ordinary statistics plus optimization.

<div class="callout">
  <strong>Thesis:</strong> Goodhart's law is not just about bad incentives. It
  is about intervention. A metric is a measurement channel. Once decisions are
  optimized through that channel, the causal process that made the metric
  informative can change.
</div>

The practical question is not "Which metric should we trust?" It is quieter and
more uncomfortable:

$$
\text{What happens to the data-generating process when this metric gets power?}
$$

That question belongs as much to causal inference as to dashboard design.

## The Number Was a Sensor

Charles Goodhart's original context was monetary policy. Relationships that
looked stable while they were merely observed became unstable once policy tried
to exploit them.[^goodhart] Donald Campbell made a related point in program
evaluation: quantitative indicators used for social decision-making become more
vulnerable to corruption pressure and more likely to distort the process they
were meant to monitor.[^campbell]

Those are not just folk warnings. They describe a structural distinction:

$$
M = \text{measure of } Y
\quad
\text{is not the same as}
\quad
Y = \text{thing we care about}.
$$

The metric $$M$$ can be useful because it is correlated with $$Y$$. But
correlation is a property of a regime. If the regime changes, the correlation
can change. In Pearl's language, observing $$M$$ and intervening to increase
$$M$$ are different operations.[^pearl]

Suppose a company cares about long-run customer trust $$Y$$, but measures
short-run engagement $$M$$. In the old regime, better products may have caused
both trust and engagement. In the optimized regime, the system discovers
notifications, dark patterns, outrage, and slot-machine timing. The causal path
into $$M$$ changes. The old correlation becomes a historical artifact.

## Four Ways the Sensor Breaks

Manheim and Garrabrant give a useful taxonomy of Goodhart effects: regressional,
extremal, causal, and adversarial.[^manheim] The boundaries blur in real
systems, but the distinctions are helpful.

Regressional Goodhart is selection on noise. If you choose the highest estimate
from many noisy estimates, the winner is likely to be overestimated. Smith and
Winkler call a closely related decision-analysis failure the optimizer's curse:
the option selected as best often disappoints because its estimated value had
positive error.[^optimizer]

Extremal Goodhart appears when the proxy was learned in an ordinary region but
optimization pushes into an unusual one. A measure that works for normal
students, borrowers, patients, ads, or model outputs may fail among the extreme
cases selected by an optimizer.

Causal Goodhart happens when intervening on the proxy breaks the path that made
it meaningful. A school can raise test scores by teaching well, but also by
narrowing the curriculum to tested items. The same score has different causal
parents.

Adversarial Goodhart appears when agents notice the metric and optimize against
its blind spots. In AI safety this is reward hacking or specification gaming:
the system satisfies the literal reward while missing the intended task.[^amodei]
Modern reinforcement-learning work studies this as reward misspecification and
shows how optimizing an imperfect proxy can eventually reduce true objective
performance.[^rl-goodhart]

<figure class="research-figure">
<svg viewBox="0 0 800 300" role="img" aria-labelledby="goodhart-title goodhart-desc">
  <title id="goodhart-title">A proxy metric changes when it becomes an intervention target</title>
  <desc id="goodhart-desc">True value and gaming channels both feed the observed metric once optimization pressure is applied.</desc>
  <defs>
    <marker id="goodhart-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#5d6872"></path>
    </marker>
  </defs>
  <rect x="48" y="78" width="132" height="66" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="114" y="106" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">True Value</text>
  <text x="114" y="127" text-anchor="middle" font-size="12" fill="#5d6872">what we wanted</text>
  <line x1="180" y1="111" x2="258" y2="111" stroke="#5d6872" stroke-width="2" marker-end="url(#goodhart-arrow)"></line>

  <rect x="266" y="78" width="132" height="66" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"></rect>
  <text x="332" y="106" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Metric</text>
  <text x="332" y="127" text-anchor="middle" font-size="12" fill="#5d6872">measurement channel</text>
  <line x1="398" y1="111" x2="476" y2="111" stroke="#5d6872" stroke-width="2" marker-end="url(#goodhart-arrow)"></line>

  <rect x="484" y="78" width="132" height="66" rx="8" fill="#ffffff" stroke="#b45309" stroke-width="2"></rect>
  <text x="550" y="106" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Selection</text>
  <text x="550" y="127" text-anchor="middle" font-size="12" fill="#5d6872">budget + status</text>

  <path d="M550 166 C550 230, 245 230, 245 165" fill="none" stroke="#2563eb" stroke-width="2" marker-end="url(#goodhart-arrow)"></path>
  <text x="397" y="242" text-anchor="middle" font-size="13" fill="#172026">optimization pressure changes behavior, effort, and the measurement process</text>

  <rect x="620" y="186" width="128" height="58" rx="8" fill="#ffffff" stroke="#b45309" stroke-width="2"></rect>
  <text x="684" y="211" text-anchor="middle" font-size="14" font-weight="700" fill="#172026">Gaming</text>
  <text x="684" y="230" text-anchor="middle" font-size="12" fill="#5d6872">shortcut channel</text>
  <path d="M620 214 C516 198, 450 160, 398 125" fill="none" stroke="#b45309" stroke-width="2" marker-end="url(#goodhart-arrow)"></path>
</svg>
<figcaption>
The metric was informative in the observational regime. Selection can create
new causal paths into the metric that do not pass through true value.
</figcaption>
</figure>

## Proxy Pressure Lab

The simulator below creates a world of candidate projects. Each project has a
true value, a noisy proxy score, and a gameable surface that can inflate the
proxy while consuming real effort. The evaluator must pick a small set of
finalists from a larger pool.

Four policies compete:

- random selection, as a baseline;
- pure proxy selection, which takes the highest metric values;
- audited selection, which penalizes visible gaming and uses a little extra
  information;
- oracle selection, which ranks by the unobserved true value.

The chart shows two bars for each policy: average true value and average proxy
score among selected projects. The gap between them is the Goodhart gap.

<div class="proxy-lab" data-proxy-lab>
  <div class="proxy-lab__controls">
    <label>
      Candidate pool: <output data-value="pool">400</output>
      <input type="range" min="40" max="2000" step="20" value="400" data-param="pool">
    </label>
    <label>
      Finalists: <output data-value="finalists">20</output>
      <input type="range" min="1" max="100" value="20" data-param="finalists">
    </label>
    <label>
      Proxy reliability: <output data-value="reliability">70%</output>
      <input type="range" min="20" max="95" value="70" data-param="reliability">
    </label>
    <label>
      Gaming surface: <output data-value="gaming">35%</output>
      <input type="range" min="0" max="90" value="35" data-param="gaming">
    </label>
    <label>
      Audit strength: <output data-value="audit">35%</output>
      <input type="range" min="0" max="95" value="35" data-param="audit">
    </label>
  </div>
  <div class="proxy-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="360" aria-label="True value and proxy score under proxy optimization"></canvas>
  <div class="proxy-lab__legend">
    <span><i style="background:#0f766e"></i> True value</span>
    <span><i style="background:#b45309"></i> Proxy score</span>
    <span><i style="background:#2563eb"></i> Zero baseline</span>
  </div>
  <p class="proxy-lab__note">
    Deterministic simulation, 500 selection rounds. Scores are standardized
    units; higher is better. The oracle is an upper bound, not an available
    policy.
  </p>
</div>
<script defer src="{{ '/assets/js/proxy-lab.js' | relative_url }}"></script>

The default run is a small Goodhart machine. Pure proxy selection finds projects
with excellent measured scores, but some of that excellence is noise and some is
gaming. Audit does not need perfect knowledge to help. Even a partial penalty
for gameable behavior can recover true value because it changes what gets
selected.

Try increasing the candidate pool while keeping the finalist count small. The
proxy winner looks better and better by the metric, but the true value often
improves much more slowly. That is regressional Goodhart. Try increasing the
gaming surface. Now the metric is not merely noisy; the act of optimizing it
creates a shortcut channel. That is causal and adversarial Goodhart starting to
mix.

## Dashboards Hide the Counterfactual

Dashboards usually show the selected world, not the counterfactual world. They
show the projects funded, ads served, students admitted, candidates hired,
papers published, or trades entered. But Goodhart's law lives in the comparison
between what was selected and what would have happened under another selection
rule.

This makes metric failure socially slippery. The number can go up for three
reasons that look identical on a dashboard:

1. the underlying thing improved;
2. noise was selected;
3. behavior moved into an unmeasured shortcut.

Only the first is the win we wanted. The other two are often invisible unless
the system keeps holdouts, audits, delayed outcomes, or independent measures.

The optimizer's curse is especially treacherous because nobody has to cheat.
If ten teams estimate the value of ten projects and the organization funds the
largest estimate, the funded project is likely to have positive estimation
error. More options make the maximum look better while also making the surprise
larger. Bayesian shrinkage is not pessimism; it is arithmetic humility.

## Before Giving the Metric Power

Before turning a metric into a target, I would ask five questions.

1. What causal path makes the metric informative?
2. What new paths into the metric open when people or models optimize it?
3. What parts of true value are not measured by the metric?
4. Which selected cases will receive delayed ground truth?
5. What decision would change if the metric were noisy, stale, or gamed?

The last question is the most operational. A metric that cannot change a
decision is decoration. A metric that can change a decision deserves a failure
model.

For AI systems, the same checklist applies to reward models and automated
verifiers. A reward model is a metric with authority. If it is used only for
offline evaluation, its errors matter. If it is used to optimize a policy, its
errors become search targets. That is why reward hacking is not a weird corner
case. It is what one should expect when a proxy has blind spots and optimization
has enough power.

## Mitigations That Change Incentives

Metric pluralism helps, but only if the metrics fail differently. Two dashboards
fed by the same proxy channel are not two independent witnesses.

Holdouts help because they preserve an observational regime. If some cases are
not optimized by the target metric, they can reveal whether the relationship
between proxy and outcome is drifting.

Delayed outcome audits help because many true objectives are slow. Customer
trust, student learning, patient health, employee quality, and model usefulness
are not fully visible at decision time.

Randomization helps because it creates counterfactual evidence. A small amount
of exploration can be worth more than a large amount of confounded dashboard
history.

Adversarial review helps because it asks a different question: "How would I make
this metric look good without creating value?" That question is uncomfortable,
which is exactly why it belongs in the design process.

Finally, shrinkage helps. Extreme proxy scores should be pulled toward a prior
unless backed by independent evidence. The more options the optimizer searched,
the more skepticism the winner deserves.

## The Question Under the Number

Metrics are not bad. A world without measurement is a world where power hides
behind stories.

But a metric is a sensor, not a soul. It is useful because of a causal
relationship that held under some regime. When the metric becomes a target, the
regime changes. Selection amplifies noise. Agents redirect effort. Models find
shortcuts. The proxy becomes a control surface.

Goodhart's law is therefore not a reason to give up on measurement. It is a
reason to treat measurement as part of the system being optimized.

The dashboard should not only ask:

> Did the number go up?

It should ask:

> What new causal paths made it go up?

## Source Notes

[^goodhart]: Charles A. E. Goodhart, ["Problems of Monetary Management: The U.K. Experience"](https://www.econbiz.de/Record/problems-of-monetary-management-the-u-k-experience-goodhart-charles/10002525062), *Papers in Monetary Economics*, 1975.

[^campbell]: Donald T. Campbell, ["Assessing the Impact of Planned Social Change"](https://ideas.repec.org/a/eee/epplan/v2y1979i1p67-90.html), *Evaluation and Program Planning*, 1979.

[^pearl]: Judea Pearl, [*Causality: Models, Reasoning, and Inference*](https://www.cambridge.org/core/books/causality/B0046844FAE10CBF274D4ACBDAEB5F5B), 2nd edition, Cambridge University Press, 2009.

[^manheim]: David Manheim and Scott Garrabrant, ["Categorizing Variants of Goodhart's Law"](https://arxiv.org/abs/1803.04585), 2018.

[^optimizer]: James E. Smith and Robert L. Winkler, ["The Optimizer's Curse: Skepticism and Postdecision Surprise in Decision Analysis"](https://pubsonline.informs.org/doi/10.1287/mnsc.1050.0451), *Management Science*, 2006.

[^amodei]: Dario Amodei et al., ["Concrete Problems in AI Safety"](https://arxiv.org/abs/1606.06565), 2016.

[^rl-goodhart]: Jacek Karwowski et al., ["Goodhart's Law in Reinforcement Learning"](https://arxiv.org/abs/2310.09144), ICLR 2024.
