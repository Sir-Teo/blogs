---
layout: post
title: "The Stable Match Has No Blocking Pair"
description: "Deferred acceptance is not a sorting algorithm. It is a way to remove every mutually tempting off-book deal while making one side best off among all stable outcomes."
date: 2026-06-14 06:42:00 -0400
categories: computer-science
tags: [matching, mechanism-design, algorithms, game-theory, school-choice, market-design]
excerpt: "A stable matching is not the matching with the largest total score. It is a matching where no unmatched pair would rather leave together. The deferred-acceptance algorithm turns that idea into a verifiable invariant."
---

The first surprise is that "best match" is the wrong phrase.

If a student likes a program, and the program likes the student, but they are
not assigned to each other, the assignment has a small conspiracy inside it.
Those two can walk away together. The official outcome says one thing; the
incentives say another.

That pair is called a blocking pair.

The stable matching problem asks for a matching with no such pair. It is not
maximizing total happiness. It is not sorting everyone by a single score. It is
not asking every agent to get their first choice. It is a different kind of
object:

```text
a matching no pair can jointly improve upon
```

That small definition is one of the cleaner bridges between algorithms and
institutions. Gale and Shapley's 1962 paper gave the classic theorem: with
strict preferences on two sides, a stable assignment always exists, and the
deferred-acceptance procedure finds one.[^gale-shapley] Roth later connected
stability to incentives and real matching markets, showing why these are not
only pretty combinatorial objects.[^roth-1982] School-choice systems, medical
matches, and other allocation mechanisms all live near the same fault line:
once agents have preferences, the system must decide which counterfactual
complaints it is willing to leave unresolved.[^abdulkadiroglu-sonmez]

## The Counterfactual Contract

Write \(S\) for students and \(P\) for programs. A matching \(\mu\) pairs each
student \(s\) with a program \(\mu(s)\), and each program \(p\) with a student
\(\mu(p)\). In the one-to-one version, \(\mu(s)=p\) if and only if
\(\mu(p)=s\).

A pair \((s,p)\) blocks \(\mu\) when both statements are true:

$$
p \succ_s \mu(s)
$$

and

$$
s \succ_p \mu(p).
$$

The first line says the student prefers that program to their assigned program.
The second line says the program prefers that student to its assigned student.
If both are true, the matching has a bilateral improvement available outside
the mechanism.

Notice what this definition does not say. It does not require the student to be
unhappy in an absolute sense. It does not require the program to be low quality.
It does not compare total welfare. The objection is local and contractual:
there exists a pair that would both defect.

This is why stability is such a powerful constraint in matching markets. It is
not a utilitarian score. It is a no-envy condition between the two sides of a
possible agreement.

## Rejection With Memory

Deferred acceptance is almost comically simple.

Students apply to their favorite program. Each program keeps the best applicant
it has seen so far and rejects the rest. Rejected students apply to their next
favorite program. Programs again keep the best applicant seen so far, possibly
dropping the previous tentative match. The process continues until nobody is
rejected.

The word "tentative" is doing real work. An early acceptance is not a promise to
stop looking. It is a held option. Programs can trade up; students can keep
searching after rejection; nobody proposes to the same program twice. With
\(n\) students and \(n\) programs, there are at most \(n^2\) proposals, so the
algorithm terminates.

The stability proof is the algorithm in reverse.

Suppose student \(s\) prefers program \(p\) to the program they got. Then \(s\)
must have proposed to \(p\) before moving farther down their list. If \(p\)
rejected \(s\), it was holding someone it preferred. From then on, \(p\)'s held
student can only improve according to \(p\)'s ranking. Therefore at the end,
\(p\) does not prefer \(s\) to its assigned student. The alleged blocking pair
cannot exist.

That is the whole invariant:

```text
when a program rejects you, it never later wishes it had kept you
```

The theorem is more subtle than existence. The student-proposing version gives
every student their best possible assignment among all stable matchings. Flip
the direction and the program-proposing version gives programs their best stable
assignment.[^gale-shapley] Roth's incentive result adds an important mechanism
design warning: the proposing side has a truth-telling advantage, while no
stable mechanism can generally make truth-telling a dominant strategy for both
sides at once.[^roth-1982]

So deferred acceptance is not neutral between sides. It is stable, but the
stable set can have an interval. Choosing who proposes chooses an endpoint.

## A Deferred-Acceptance Lab

The lab below generates a synthetic one-to-one market. "Shared prestige" makes
many students agree about which programs are desirable, and many programs agree
about which students are desirable. "Mutual fit" adds pair-specific affinity
that both sides partially share. Every generated market has complete strict
preferences.

The visualization compares three assignments:

1. student-proposing deferred acceptance,
2. program-proposing deferred acceptance,
3. a random pairing.

The green cells are the student-proposing stable match. Purple outlines mark
the program-proposing stable match. Red dots mark examples of blocking pairs in
the random pairing. The rank ledger reports average rank, where lower is
better.

<style>
  .stable-lab {
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

  .stable-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .stable-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .stable-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .stable-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .stable-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .stable-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .stable-lab__metric span,
  .stable-lab__legend,
  .stable-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .stable-lab__metric span {
    display: block;
  }

  .stable-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .stable-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 560px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .stable-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .stable-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .stable-lab__swatch {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .stable-lab__swatch--student {
    background: #0f766e;
  }

  .stable-lab__swatch--program {
    background: #7c3aed;
  }

  .stable-lab__swatch--bad {
    background: #be123c;
  }

  .stable-lab__note {
    margin-top: 0.55rem;
  }

  @media (max-width: 720px) {
    .stable-lab {
      padding: 0.8rem;
    }

    .stable-lab__controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .stable-lab__metrics {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }

    .stable-lab__controls input {
      width: calc(100% - 2px);
    }

    .stable-lab canvas {
      height: 780px;
    }
  }
</style>

<div class="stable-lab" data-stable-matching-lab>
  <div class="stable-lab__controls">
    <label>
      Market size <output data-value="agents">14</output>
      <input data-param="agents" type="range" min="6" max="32" step="1" value="14">
    </label>
    <label>
      Shared prestige <output data-value="common">30%</output>
      <input data-param="common" type="range" min="0" max="100" step="5" value="30">
    </label>
    <label>
      Mutual fit <output data-value="mutual">30%</output>
      <input data-param="mutual" type="range" min="0" max="100" step="5" value="30">
    </label>
    <label>
      Seed <output data-value="seed">20</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="20">
    </label>
    <label>
      Trial average <output data-value="trials">30</output>
      <input data-param="trials" type="range" min="6" max="80" step="1" value="30">
    </label>
  </div>
  <div class="stable-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Deferred acceptance matching lab"></canvas>
  <div class="stable-lab__legend">
    <span><i class="stable-lab__swatch stable-lab__swatch--student"></i> student-proposing DA</span>
    <span><i class="stable-lab__swatch stable-lab__swatch--program"></i> program-proposing DA</span>
    <span><i class="stable-lab__swatch stable-lab__swatch--bad"></i> random blocking pair</span>
  </div>
  <p class="stable-lab__note">
    The default market has zero blocking pairs under deferred acceptance and
    dozens under a random matching. Changing the proposal side changes which
    stable endpoint each side receives.
  </p>
</div>

<script src="{{ '/assets/js/stable-matching-lab.js?v=20260614a' | relative_url }}"></script>

## What the Experiment Is Actually Checking

The lab is not using a canned theorem display. It generates preference lists,
runs both deferred-acceptance directions, and then enumerates all possible
student-program pairs to count blocking pairs.

For the default seed, student-proposing DA produces zero blocking pairs. A
random pairing produces many. More interestingly, program-proposing DA also
produces zero blocking pairs, but the average ranks move in opposite directions.
The stable constraint does not pick a unique social outcome.

This is the part people often miss. Stability is a feasibility condition over
counterfactual agreements. It rules out assignments that can be undermined by a
pair. But when many stable matchings exist, an additional design choice still
matters.

Student-proposing DA says:

```text
among stable outcomes, make students as well off as possible
```

Program-proposing DA says the analogous thing for programs.

Neither sentence is hidden in the implementation. In the code, the only
operation is proposal, rejection, and replacement. The global property emerges
because every rejection records a fact about impossibility: the rejected side
cannot later claim that receiver as part of any stable outcome that improves
them.

## Why This Is Not Just a Toy Wedding Algorithm

The marriage metaphor is historically sticky, but the modern applications are
institutional.

In school choice, the two sides are students and schools, but school rankings
are often priorities rather than subjective preferences. A district may care
about sibling priority, walk zones, lotteries, or legal constraints. In that
setting, student-proposing deferred acceptance is attractive because truthful
ranking is a dominant strategy for students under fixed priorities, and the
result is stable with respect to those priorities.[^abdulkadiroglu-sonmez]

That does not make the problem morally automatic. Priorities can encode policy
choices. Capacities can be contested. Ties require tie-breaking. Some districts
care about diversity constraints or reserved seats. A stable mechanism can
still reflect an unfair priority structure. The algorithm removes one class of
strategic and blocking instability; it does not decide the public objective.

In labor markets, the story changes again. Participants may interview, signal,
time offers, form couples, or care about geographic constraints. The National
Resident Matching Program is the famous case study in the matching literature,
and it led to decades of work on how stability, strategy, and practical market
rules interact.[^nber-da]

The useful lesson for computer scientists is not "always use deferred
acceptance." It is sharper:

```text
first decide which deviations the mechanism must survive
```

If the dangerous deviation is a bilateral pair that both prefer, stability is
the right invariant to inspect. If the dangerous deviation is coalition
formation, budget gaming, false capacity reports, collusion, or dynamic
learning, the invariant is different.

## Stability Is a Local Notion With Global Teeth

A maximum-weight matching can be unstable. A stable matching can be far from
maximum weight. This is not a bug; it is the point.

Imagine assigning projects to engineers. A global optimizer may place Alice on
Project X because that raises total output, even though Alice and Project Y
prefer each other. If the assignment is a command hierarchy, maybe that is fine.
If the assignment is a market where Alice and Project Y can route around the
allocator, then the optimizer has designed a fragile outcome.

Stable matching treats a match as a contract rather than a score. The matching
is not judged only by the objective value it achieves on paper. It is judged by
whether a pair has a reason to ignore it.

That framing appears all over software systems:

- task assignment when teams can renegotiate,
- peer selection in networks where nodes can choose partners,
- marketplace ranking where both sides can abandon the platform,
- recommendation systems where creators and consumers respond strategically,
- model routing where clients and providers can form side agreements.

In each case, "optimal" is incomplete until you specify what kind of defection
is allowed.

## A Small Theorem With a Design Choice Inside

Deferred acceptance has the feel of a sorting algorithm if you only watch the
proposals move. But sorting has one order. Deferred acceptance has two sides,
and the direction of motion matters.

That is the enduring lesson of the theorem:

1. stability can be guaranteed,
2. the guarantee is constructive,
3. the stable outcome selected by the construction favors the proposing side,
4. truthfulness and stability cannot be handed to both sides for free.

The algorithm is simple because it stores exactly the right memory: every
receiver remembers the best proposal so far. The economics is subtle because
"best stable matching" is not a scalar. It is indexed by a side.

So the stable match is not the match where everyone is happiest. It is the match
where every tempting pairwise escape has already been answered.

That is a different kind of optimality, and in markets with humans inside it,
often a more durable one.

[^gale-shapley]: D. Gale and L. S. Shapley, ["College Admissions and the Stability of Marriage"](https://sites.math.washington.edu/~billey/classes/562.winter.2018/articles/Gale.Shapley.pdf), *The American Mathematical Monthly*, 69(1), 1962.

[^roth-1982]: Alvin E. Roth, ["The Economics of Matching: Stability and Incentives"](https://pubsonline.informs.org/doi/10.1287/moor.7.4.617), *Mathematics of Operations Research*, 7(4), 1982.

[^abdulkadiroglu-sonmez]: Atila Abdulkadiroglu and Tayfun Sonmez, ["School Choice: A Mechanism Design Approach"](https://www.aeaweb.org/articles?id=10.1257%2F000282803322157061), *American Economic Review*, 93(3), 2003.

[^nber-da]: Alvin E. Roth, ["Deferred Acceptance Algorithms: History, Theory, Practice, and Open Questions"](https://www.nber.org/system/files/working_papers/w13225/w13225.pdf), NBER Working Paper 13225, 2007.
