---
layout: post
title: "A Review Queue Is a Memory Budget"
description: "Spaced repetition is not a productivity spell. It is a control problem over memories whose recall probabilities decay at different rates."
date: 2026-06-13 22:50:00 -0400
categories: psychology
tags: [spaced-repetition, forgetting-curve, memory, learning-science, scheduling, psychology]
excerpt: "A good review queue is not nostalgia for yesterday's lesson. It asks which memory is closest to falling below the recall level you are willing to tolerate."
---

Forgetting is not the enemy of learning.

It is the clock that makes scheduling necessary.

If every memory stayed sharp forever, studying would be a packing problem: put
facts into the head once, move on. If every memory vanished instantly, studying
would be hopeless. Human memory lives in the interesting middle. Traces decay,
practice changes the decay rate, retrieval can strengthen the trace, and the
right next review depends on the future date you care about.

That turns learning into a scheduling problem.

The naive question is:

```text
How often should I review this?
```

The better question is:

```text
When will predicted recall fall below the level I am willing to risk?
```

A flashcard app is not just a pile of cards. It is a tiny control system with a
daily budget, trying to keep thousands of memories above a threshold.

## The Curve Does Not Pick the Card

Ebbinghaus made forgetting measurable. In *Memory: A Contribution to
Experimental Psychology*, he used himself as the subject, studied nonsense
syllables, and measured retention and relearning across delays.[^ebbinghaus]
The famous curve is easy to over-simplify, but its central lesson is still
alive: retention changes quickly at first and slowly later.

That fact alone does not tell you when to review.

Suppose recall follows a simple half-life model:

```text
P(recall after t days) = 2^(-t / h)
```

where `h` is the current half-life of the item. If you want recall to stay near
`target`, the next review should arrive around:

```text
t_due = h * log(target) / log(0.5)
```

For `target = 0.8`, that is about `0.32 h`. For `target = 0.5`, it is `h`.
The same memory can be reviewed soon or late depending on the operational
standard. A medical fact, a language flashcard, and a theorem lemma do not need
the same risk budget.

This is why "review every day" is wasteful and "wait until you forget" is too
late. The useful zone is between boredom and collapse.

## The Ridge, Not the Rule

The spacing effect is robust, but it is not a single magic interval.

Cepeda, Pashler, Vul, Wixted, and Rohrer reviewed 839 assessments of
distributed practice across 317 experiments in 184 articles. Their synthesis
found that the best interstudy interval depends jointly on the delay to the
final test.[^cepeda-2006] A later experiment made the ridge visible: for a given
test delay, increasing the gap first helped and then hurt. The optimal gap grew
with test delay, while the optimal gap as a fraction of test delay shrank from
roughly 20-40 percent for a 1-week delay to roughly 5-10 percent for a 1-year
delay.[^cepeda-2008]

That is the sentence most school calendars ignore.

Spacing is not simply "longer is better." If the gap is too short, retrieval is
too easy and the practice does little. If the gap is too long, the learner fails
or relearns from scratch. The optimum is a ridge, not a point.

Pavlik and Anderson framed practice scheduling as a model-based balancing act:
spacing, recency, and frequency pull in different directions, and an optimized
condition can outperform hand-designed schedules.[^pavlik-anderson] Settles and
Meeder later brought this into a production language-learning setting with
half-life regression. Their Duolingo model estimated item half-lives from
practice history, reduced recall-rate prediction error by more than 45 percent
relative to baselines, and improved daily engagement by 12 percent in an
operational study.[^settles-meeder]

The modern version is even more explicit. Tabibian and coauthors model spaced
repetition as an optimal-control problem: review schedules are chosen to
maximize retention while controlling review effort.[^tabibian] That is exactly
what a review queue feels like when the deck is large. The hard part is not
knowing that spacing helps. The hard part is deciding which item gets the next
scarce review.

## Queue Lab

The lab below simulates a small deck of memories. Each item has a difficulty and
a current half-life. Recall probability decays as:

```text
P = 2^(-days_since_review / half_life)
```

When an item is reviewed, the model samples a deterministic recall outcome from
that probability, gives feedback, and updates the half-life. Reviews that happen
when recall is already very high are counted as **too easy**. Reviews that
happen after recall has fallen too low are counted as **too late**.

Four scheduling policies share the same deck, horizon, new-card rate, and daily
review budget:

- **Massed** spends early reviews quickly and then leaves items alone.
- **Fixed** reviews every item at a fixed cadence.
- **Leitner** moves cards through boxes with longer intervals after successful
  recall and shorter intervals after failure.
- **Half-life** reviews the most at-risk due items when predicted recall falls
  below the selected target.

<style>
  .spacing-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .spacing-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }

  .spacing-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .spacing-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .spacing-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .spacing-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .spacing-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .spacing-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.42);
  }

  .spacing-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .spacing-lab__metric span,
  .spacing-lab__note,
  .spacing-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .spacing-lab__metric span {
    display: block;
  }

  .spacing-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .spacing-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .spacing-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.65rem;
  }

  .spacing-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .spacing-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .spacing-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="spacing-lab" id="spacing-lab" data-spaced-repetition-lab>
  <div class="spacing-lab__controls">
    <label>
      Horizon
      <select data-param="horizon">
        <option value="45">45 days</option>
        <option value="90" selected>90 days</option>
        <option value="180">180 days</option>
      </select>
    </label>
    <label>
      New cards per day
      <select data-param="newPerDay">
        <option value="2">2</option>
        <option value="4" selected>4</option>
        <option value="6">6</option>
      </select>
    </label>
    <label>
      Review budget
      <select data-param="budget">
        <option value="10">10 / day</option>
        <option value="18" selected>18 / day</option>
        <option value="30">30 / day</option>
      </select>
    </label>
    <label>
      Target recall
      <select data-param="target">
        <option value="0.7">70%</option>
        <option value="0.8" selected>80%</option>
        <option value="0.9">90%</option>
      </select>
    </label>
    <label>
      Highlight
      <select data-param="highlight">
        <option value="massed">Massed</option>
        <option value="fixed">Fixed</option>
        <option value="leitner">Leitner</option>
        <option value="halflife" selected>Half-life</option>
      </select>
    </label>
  </div>
  <div class="spacing-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Spaced repetition scheduler lab comparing massed, fixed, Leitner, and half-life review policies"></canvas>
  <div class="spacing-lab__legend">
    <span><i style="background:#172026"></i> Massed</span>
    <span><i style="background:#7c3aed"></i> Fixed</span>
    <span><i style="background:#2563eb"></i> Leitner</span>
    <span><i style="background:#0f766e"></i> Half-life</span>
    <span><i style="background:#d97706"></i> Review debt</span>
  </div>
  <p class="spacing-lab__note">
    Deterministic synthetic model. The point is not that these parameters are
    universal; the point is that a scheduler must trade retention against review
    effort, and the right interval depends on the target horizon and item
    difficulty.
  </p>
</div>
<script defer src="{{ '/assets/js/spaced-repetition-lab.js?v=20260613a' | relative_url }}"></script>

The default setting is intentionally crowded: `4` new cards per day, `18`
reviews per day, and a 90-day horizon. The half-life controller usually keeps
more of the deck above target because it spends reviews near the edge of
forgetting instead of on cards that are already easy.

Raise **Target recall** to `90%`. The half-life policy will review earlier and
more often. Lower the **Review budget** to `10 / day`; the queue starts to carry
debt. The scheduler is not magic. It can only allocate scarce retrievals.

Switch **Highlight** to `Massed`. Its early recall looks fine because it spends
reviews immediately. The final exam-day recall is the warning: practice that is
optimized for today's fluency can be badly scheduled for future access.

## Memory Budget Interface

The next useful learning system would not expose a single "due" date. It would
expose a memory budget:

- predicted recall now;
- predicted recall at the exam or use date;
- half-life estimate and uncertainty;
- review cost for moving the item above target;
- opportunity cost of reviewing this item instead of another;
- queue debt created by adding new material today.

That interface would make the learner's real trade-off visible. New cards are
not free. A daily streak is not a retention guarantee. Review ease is not the
same as review value.

The best review is often the one that feels slightly uncomfortable and arrives
just before the memory would become expensive to recover.

That is the strange kindness of forgetting: it tells the scheduler where effort
has become useful again.

[^ebbinghaus]: Hermann Ebbinghaus, *Memory: A Contribution to Experimental Psychology*, 1885, translated by Henry A. Ruger and Clara E. Bussenius, 1913. [Classics in the History of Psychology](https://psychclassics.yorku.ca/Ebbinghaus/), [PMC edition](https://pmc.ncbi.nlm.nih.gov/articles/PMC4117135/).

[^cepeda-2006]: Nicholas J. Cepeda, Harold Pashler, Edward Vul, John T. Wixted, and Doug Rohrer, "Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis," *Psychological Bulletin*, 2006. [PubMed](https://pubmed.ncbi.nlm.nih.gov/16719566/), [PDF](https://augmentingcognition.com/assets/Cepeda2006.pdf).

[^cepeda-2008]: Nicholas J. Cepeda, Edward Vul, Doug Rohrer, John T. Wixted, and Harold Pashler, "Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention," *Psychological Science*, 2008. [SAGE abstract](https://journals.sagepub.com/doi/abs/10.1111/j.1467-9280.2008.02209.x), [PDF](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf).

[^pavlik-anderson]: Philip I. Pavlik Jr. and John R. Anderson, "Using a Model to Compute the Optimal Schedule of Practice," *Journal of Experimental Psychology: Applied*, 2008. [University page](https://digitalcommons.memphis.edu/facpubs/8906/).

[^settles-meeder]: Burr Settles and Brendan Meeder, "A Trainable Spaced Repetition Model for Language Learning," *ACL*, 2016. [ACL Anthology](https://aclanthology.org/P16-1174/), [PDF](https://research.duolingo.com/papers/settles.acl16.pdf), [code and data](https://github.com/duolingo/halflife-regression).

[^tabibian]: Behzad Tabibian, Utkarsh Upadhyay, Abir De, Ali Zarezade, Bernhard Scholkopf, and Manuel Gomez-Rodriguez, "Enhancing Human Learning via Spaced Repetition Optimization," *PNAS*, 2019. [PNAS](https://www.pnas.org/doi/10.1073/pnas.1815156116), [arXiv version](https://arxiv.org/abs/1712.01856).
