---
layout: post
title: "Rare Targets Rewrite the Search"
description: "Low-prevalence visual search is not just ordinary perception with fewer positives. Rarity changes item criteria, quitting thresholds, and the kind of mistakes people make."
date: 2026-06-14 00:36:00 -0400
categories: psychology
tags: [visual-search, prevalence-effect, attention, signal-detection, decision-criteria, psychology]
excerpt: "When targets are rare, misses can rise even if the observer knows the target and receives feedback. The target did not only become unlikely. The observer learned a different stopping policy."
---

The dangerous search is not always the hard one.

Sometimes the target is visible. The observer knows what it looks like. The
display stays on the screen until response. Feedback is given. The task is not a
brief flash, not a subliminal trick, not a memory test.

And still, when the target becomes rare, people miss it.

This is the part that feels unfair. Rarity sounds like a fact about the world,
not a fact about perception. If a target is present, it is present. Why should
its base rate change whether the eye finds it?

Because visual search is not only perception. It is a policy.

The observer must decide which items deserve scrutiny, how much evidence is
enough to say "present", and when to stop searching and say "absent". Low
prevalence does not merely make positive trials uncommon. It trains those
decisions.

```text
the rare target changes the observer
```

## The Target Is Not Alone

Visual search begins with an odd asymmetry. A feature target can pop out: the
one red item among green items, the one vertical bar among horizontal bars. A
conjunction target is different: the red vertical item among red horizontal and
green vertical items. Treisman and Gelade's feature-integration theory made this
distinction famous. Features can be registered early and broadly, but binding
features into object identities needs focused attention.[^treisman]

Later visual-search models complicated the picture. Search is not simply
"parallel" or "serial". Attention is guided. Some items are more target-like,
more salient, or more consistent with the current template, so they are checked
earlier.[^wolfe-horowitz] Psychophysical accounts of search often frame the
problem as noisy evidence across many locations or items, then ask how an
observer combines that evidence into a decision.[^palmer]

That last phrase is the hinge:

```text
evidence into a decision
```

The evidence is not the response. An item can have target-like evidence without
being called a target. A display can contain a target that is never inspected. A
search can stop while useful evidence remains on the table.

Signal detection theory gives the old language for this distinction.[^green]
There is sensitivity: how separated target and distractor evidence are. And
there is criterion: how much evidence is required before the observer says yes.
Move sensitivity and the distributions separate. Move criterion and the same
evidence produces a different pattern of hits, misses, false alarms, and correct
rejections.

Visual search adds a second criterion. Besides the criterion for saying "this
item is a target", there is a criterion for saying "I am done looking".

That second criterion is where rarity becomes especially strange.

## The Experiment That Should Make Screeners Nervous

Wolfe, Horowitz, and Kenner tested an artificial baggage-screening task in which
observers searched for tools among overlapping, semi-transparent objects on
noisy backgrounds.[^rare] The target prevalence was 50%, 10%, or 1%. The low
prevalence condition was deliberately long: at 1%, each observer needed 2,000
trials to get about 20 target-present trials.

The result was not subtle.

At 50% prevalence, target misses were about 7%. At 10%, misses rose to about
16%. At 1%, they rose to about 30%. False alarms were extremely rare. The
problem was not that people became reckless and said yes too often. The problem
was that they said no too readily.

The reaction times were the clue. In many ordinary search tasks, absent trials
take longer than present trials because a target can end the search early, while
an absent response requires enough checking to justify giving up. At low
prevalence, Wolfe and colleagues found the pattern could invert: absent
responses became faster than present responses. The observer was not merely
failing to recognize targets. The observer was quitting too soon.

The same paper contains a detail that prevents the easy explanation. Maybe rare
targets are missed because the observer has little practice with them. But in a
mixed-target experiment, some target was present on half the trials while one
specific target type remained very rare. The very rare target was still missed
far more often. Prevalence itself mattered, not just the absolute number of
positive examples.

Later work made the effect look stubborn. Low target prevalence remained a
source of search errors under variants that tried to make rare targets more
available or more salient.[^stubborn] Not every intervention fails, and not
every task has the same effect size, but the baseline lesson is hard to ignore:
the base rate is part of the task.

## Two Ways to Miss the Same Target

There are two separable routes to a miss.

First, the observer can inspect the target and reject it. This is an item-level
criterion problem. If the target evidence is noisy and the criterion is high,
the target does not clear the bar.

Second, the observer can never inspect the target. This is a quitting problem.
The target may be sitting in the display, but the search terminates before
attention reaches it.

Wolfe and Van Wert argued that prevalence can reveal two dissociable decision
criteria in visual search.[^two-criteria] In their framing, observers can shift
an item criterion and a quitting threshold. These are not the same lever. A
stricter item criterion says:

```text
I looked at this, but it was not convincing enough.
```

A lower quitting threshold says:

```text
I did not find anything quickly, so this is probably absent.
```

Low prevalence pushes both in plausible directions. If targets are rare, the
prior odds of target presence are low, so a conservative observer should require
stronger evidence before saying yes. At the same time, most target-absent
responses are rewarded. Trial after trial teaches the motor system and the
control system that "no" is usually correct. The search can become fast, fluent,
and wrong on precisely the trials that matter.

This is not a contradiction. It is two criteria adapting to the same
environment.

## A Rare-Target Search Lab

The toy lab below has a display of noisy items. One target may be present.
Every item receives an evidence value. The target, when present, has a higher
mean evidence than distractors, controlled by `d'`. Items are inspected in a
guided order: target-like items tend to be checked earlier, but guidance is
noisy. The observer says "present" if an inspected item clears an item
criterion. If not, the observer quits after a limited number of inspections and
says "absent".

The slider called **prevalence pressure** controls how much the observer adapts
to the base rate. At zero, the policy is fixed across prevalence levels. At high
values, low prevalence raises the item criterion and reduces the number of
items inspected before quitting.

This is not a reproduction of any experiment. It is a small executable diagram
of the two-criterion story.

<style>
  .rare-search-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rare-search-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }

  .rare-search-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rare-search-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .rare-search-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .rare-search-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rare-search-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.7rem;
  }

  .rare-search-lab__metric span,
  .rare-search-lab__legend,
  .rare-search-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rare-search-lab__metric span {
    display: block;
  }

  .rare-search-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .rare-search-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .rare-search-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.8rem;
  }

  .rare-search-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rare-search-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .rare-search-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div class="rare-search-lab" data-rare-target-search-lab>
  <div class="rare-search-lab__controls">
    <label>
      Target prevalence: <output data-value="prevalence">2%</output>
      <input type="range" min="1" max="50" step="1" value="2" data-param="prevalence">
    </label>
    <label>
      Set size: <output data-value="setSize">18</output>
      <input type="range" min="4" max="32" step="1" value="18" data-param="setSize">
    </label>
    <label>
      Target discriminability d': <output data-value="signal">3.2</output>
      <input type="range" min="120" max="420" step="10" value="320" data-param="signal">
    </label>
    <label>
      Prevalence pressure: <output data-value="prevalencePressure">75%</output>
      <input type="range" min="0" max="100" step="1" value="75" data-param="prevalencePressure">
    </label>
    <label>
      Search caution: <output data-value="caution">82%</output>
      <input type="range" min="35" max="100" step="1" value="82" data-param="caution">
    </label>
  </div>
  <div class="rare-search-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Rare target visual search simulator showing miss rates, decision thresholds, target and absent outcomes, and one target-present display"></canvas>
  <div class="rare-search-lab__legend">
    <span><i style="background:#0f766e"></i> Hits and target evidence</span>
    <span><i style="background:#be123c"></i> Misses or strict item criterion</span>
    <span><i style="background:#d97706"></i> False alarms</span>
    <span><i style="background:#2563eb"></i> Fixed policy</span>
    <span><i style="background:#7c3aed"></i> Prevalence-adapted policy</span>
  </div>
  <p class="rare-search-lab__note">
    Deterministic toy model. The numbers are qualitative, not estimates for
    airport screening, radiology, security work, or any individual observer.
  </p>
</div>
<script src="{{ '/assets/js/rare-target-search-lab.js?v=20260614b' | relative_url }}"></script>

Start with the default: 2% prevalence, a reasonably discriminable target, and a
policy that adapts strongly to prevalence. Misses are not produced because the
target has zero signal. They are produced because the observer often inspects
too few items, and because the item criterion has moved upward.

Now drag **prevalence pressure** to zero. The miss rate drops, but the false
alarm rate rises. This is the base-rate bargain in miniature. A fixed liberal
policy catches more rare targets by treating many target-absent displays as
suspicious.

Raise **target prevalence** toward 50%. The adapted policy becomes more willing
to say yes and more willing to keep searching. Misses fall. False alarms rise.
The target did not become more visible. The observer changed what a search is
allowed to cost.

Lower **search caution** at 1% or 2% prevalence. The display panel becomes the
important one. Rings mark the items inspected before response or quitting. A
target can sit in the display and remain uninspected. This is not a failure of
the retina. It is a failure of the stopping rule.

## "Just Say No" Is a Model

Chun and Wolfe asked a deceptively practical question: how are searches
terminated when there is no target present?[^chun-wolfe] A literal serial model
would inspect every item and then quit. But people often terminate blank trials
too quickly for that to be the whole story. Guided Search offers a different
answer: items carry activations or target-likeness values, and the observer
samples promising items until either a target is found or the remaining evidence
falls below a quitting threshold.

That model makes the prevalence effect feel less mysterious. Low prevalence
does not need to alter early vision. It can alter the value of continuing.

Imagine a searcher whose recent history is:

```text
absent, absent, absent, absent, absent, absent, absent, absent, absent
```

After that history, a quick "no" is usually reinforced. It feels efficient. It
keeps the queue moving. It is correct most of the time. The rare target is the
case where that learned efficiency becomes a liability.

This is why "try harder" is not a theory of rare-target misses. The observer may
already be trying. The problem is that effort is being allocated under a policy
whose feedback is dominated by negative cases.

## The Base Rate Is Training Data

A low-prevalence task is an imbalanced dataset with a human in the loop.

Most trials teach the same response. Most rewards come from saying absent. Most
errors that would reveal an over-fast stopping rule are unobserved because the
target is absent. The system gets an enormous number of correct rejections and
a tiny number of informative misses.

This looks familiar if you come from machine learning. A classifier trained on
rare positives can become excellent at the majority class while silently
damaging recall. The psychology version is sharper because the human is not
just a classifier. The human chooses how long to compute.

In a model, class imbalance can shift a decision threshold. In visual search,
class imbalance can also change computation time.

```text
rare positive -> stricter yes criterion
rare positive -> cheaper early stopping
rare positive -> fewer chances to correct the first impression
```

That is the hidden cost of rare events. They do not merely appear less often.
They provide less frequent corrective feedback for the very policy that must
catch them.

## What Helps, and What Probably Does Not

The naive fix is to add more positives. Training with enriched target prevalence
can help people see more examples and calibrate what targets look like. But it
does not automatically solve the low-prevalence operating problem. If production
prevalence is 1%, the production policy still lives in a world where almost
every "no" is rewarded.

A better design separates at least four things:

1. **Perceptual training:** show enough varied targets that the template is not
   brittle.
2. **Criterion calibration:** give feedback that makes misses visible, not just
   correct rejections.
3. **Stopping discipline:** audit how long absent and present searches take,
   not only whether the final button press was correct.
4. **Prevalence-aware evaluation:** report recall and false alarms by base-rate
   condition, not only pooled accuracy.

In operational systems, this can mean controlled target insertion, second reads,
adjudication queues, slower review for high-impact negatives, or independent
audits that estimate misses rather than counting only discovered positives. The
right choice depends on domain costs. A false alarm in one setting is annoying;
in another it is expensive, harmful, or politically unacceptable. A miss can be
trivial or catastrophic.

The point is not "always lower the threshold". The point is that the threshold
exists.

## The Hard Part Is the Negative Case

A target-present response has a natural endpoint. You found something.

A target-absent response is different. It is a claim about what did not happen.
That claim requires a stopping rule, and stopping rules are where institutions
hide their assumptions.

How much of the image did the radiologist inspect? How long did the reviewer
look at the transaction? How many candidate explanations did the investigator
consider? How many logs did the engineer check before saying the outage is not
in this subsystem? How many adversarial examples did the evaluator run before
saying the model is safe enough?

The negative answer is not free. It is purchased with search.

Rare targets are dangerous because they make the purchase look overpriced most
of the time. The system learns to save effort on negatives. The bill arrives on
the rare positive.

That is the small moral of the prevalence effect:

```text
absence is a decision, not an observation
```

And when the thing you seek is rare, the decision to stop becomes part of the
thing you are measuring.

[^treisman]: Anne M. Treisman and Garry Gelade, "A Feature-Integration Theory of Attention," *Cognitive Psychology* 12, no. 1, 1980, 97-136. DOI: [10.1016/0010-0285(80)90005-5](https://doi.org/10.1016/0010-0285(80)90005-5). PubMed: [7351125](https://pubmed.ncbi.nlm.nih.gov/7351125/).

[^wolfe-horowitz]: Jeremy M. Wolfe and Todd S. Horowitz, "What attributes guide the deployment of visual attention and how do they do it?", *Nature Reviews Neuroscience* 5, 2004, 495-501. DOI: [10.1038/nrn1411](https://doi.org/10.1038/nrn1411). PubMed: [15152199](https://pubmed.ncbi.nlm.nih.gov/15152199/).

[^palmer]: John Palmer, Preeti Verghese, and Michael Pavel, "The Psychophysics of Visual Search," *Vision Research* 40, 2000, 1227-1268. DOI: [10.1016/S0042-6989(99)00244-8](https://doi.org/10.1016/S0042-6989(99)00244-8). PubMed: [10788638](https://pubmed.ncbi.nlm.nih.gov/10788638/).

[^green]: David M. Green and John A. Swets, *Signal Detection Theory and Psychophysics*, Wiley, 1966: [Google Books record](https://books.google.com/books/about/Signal_Detection_Theory_and_Psychophysic.html?id=E-04zQEACAAJ). See also Neil A. Macmillan and C. Douglas Creelman, *Detection Theory: A User's Guide*, 2nd ed., Lawrence Erlbaum, 2005: [publisher page](https://www.taylorfrancis.com/books/mono/10.4324/9781410611147/detection-theory-neil-macmillan-douglas-creelman).

[^rare]: Jeremy M. Wolfe, Todd S. Horowitz, and Naomi M. Kenner, "Rare items often missed in visual searches," *Nature* 435, 2005, 439-440. DOI: [10.1038/435439a](https://doi.org/10.1038/435439a). Author PDF with supplementary methods: [search.bwh.harvard.edu/new/pubs/Nature_suppl.pdf](https://search.bwh.harvard.edu/new/pubs/Nature_suppl.pdf).

[^stubborn]: Jeremy M. Wolfe, et al., "Low Target Prevalence Is a Stubborn Source of Errors in Visual Search Tasks," *Journal of Experimental Psychology: General* 136, no. 4, 2007, 623-638. DOI: [10.1037/0096-3445.136.4.623](https://doi.org/10.1037/0096-3445.136.4.623).

[^two-criteria]: Jeremy M. Wolfe and Michael J. Van Wert, "Varying Target Prevalence Reveals Two Dissociable Decision Criteria in Visual Search," *Current Biology* 20, no. 2, 2010, 121-124. DOI: [10.1016/j.cub.2009.11.066](https://doi.org/10.1016/j.cub.2009.11.066). PubMed: [20079642](https://pubmed.ncbi.nlm.nih.gov/20079642/). Supplement: [search.bwh.harvard.edu/new/pubs/Wolfe%2C%20VanWert10%20Supliment.pdf](https://search.bwh.harvard.edu/new/pubs/Wolfe%2C%20VanWert10%20Supliment.pdf).

[^chun-wolfe]: Marvin M. Chun and Jeremy M. Wolfe, "Just Say No: How Are Visual Searches Terminated When There Is No Target Present?", *Cognitive Psychology* 30, no. 1, 1996, 39-78. DOI: [10.1006/cogp.1996.0002](https://doi.org/10.1006/cogp.1996.0002). PubMed: [8635311](https://pubmed.ncbi.nlm.nih.gov/8635311/).
