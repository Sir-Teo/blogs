---
layout: post
title: "The Menu Has Entropy"
description: "Hick-Hyman law is not a bumper sticker for removing choices. It is a small information-theoretic model of choice reaction time, and it gets useful only when we keep entropy, search, compatibility, and stage costs separate."
date: 2026-06-16 22:30:00 -0400
categories: psychology
tags: [hick-hyman-law, reaction-time, entropy, human-computer-interaction, interface-design, psychology, information-theory]
excerpt: "A twelve-item menu is not always twelve choices. If people learn the odds, the decision has entropy. But hiding items behind a More button only helps when it saves some other cost."
---

The dangerous version of Hick's law is the one that fits on a sticker:

```text
more choices -> slower decisions
```

That sentence is not exactly false. It is worse: it is too easy to use.

The original Hick-Hyman result belongs to a narrower and more interesting
world. A person sees one stimulus from a known set, has learned a
stimulus-response mapping, and must respond as quickly as possible. In that
world, response time often looks close to a line in the amount of information
carried by the stimulus.[^hick][^hyman]

The line is usually written

$$
T = a + bH,
$$

where

$$
H = \sum_i p_i \log_2 \frac{1}{p_i}.
$$

When all choices are equally likely, this collapses to $$H=\log_2 n$$. But real
software is rarely that polite. In a command palette, a trading terminal, an
IDE, or a game inventory, the user may know that a few actions dominate. The
menu still has twelve visible items, but the decision does not necessarily have
$$\log_2 12$$ bits.

That is the first correction: count uncertainty, not just buttons.

The second correction is more important for design: entropy is not visual
search.

## A Small Conservation Law For Menus

Imagine a menu with probabilities $$p_1,\ldots,p_n$$. Now split it into a
first screen with the top $$k$$ commands and a final item named More. If the
target is in the tail, the user opens the tail and chooses there.

The first stage has probabilities

$$
p_1,\ldots,p_k,\quad p_\mathrm{tail}.
$$

The tail stage has normalized probabilities $$p_i/p_\mathrm{tail}$$. By the
chain rule for entropy,

$$
H(\text{first stage}) +
p_\mathrm{tail}H(\text{tail} \mid \text{More})
=
H(\text{original menu}).
$$

So if Hick-Hyman entropy were the only cost, splitting a menu would be neutral
in expectation. You did not destroy uncertainty. You moved it into a second
screen.

That is why "hide choices to satisfy Hick's law" is the wrong reflex. Hiding
items can help, but the reason has to come from somewhere else:

- less visual search on the first screen;
- better stimulus-response compatibility;
- less movement or scrolling;
- lower memory burden for frequent actions;
- a learned prior that makes a few commands genuinely likely.

It can also hurt. More creates a stage cost. It can add a mode, a transition,
and a second search. The question is not "how many items are visible?" The
question is "which costs moved, and how often does the user pay them?"

## The Lab

The experiment below is not new human-subject data. It is a deterministic
browser model that keeps the pieces apart:

- a Hick-Hyman term, $$a+bH$$;
- a compatibility slider that changes the slope $$b$$;
- a visible-search tax charged per visible item;
- a More-stage cost;
- a skewed command distribution learned by the user;
- a simulated trial histogram with jitter around the expected times.

With the default settings, twelve commands have only 3.164 bits of entropy
because the top five commands carry 74.4% of the probability mass. A uniform
count would say 3.585 bits. The model estimates:

```text
flat menu, learned odds        897 ms
flat menu, uniform assumption  968 ms
top-five + More menu           877 ms
Hick-Hyman slope               167 ms/bit
```

The shortcut menu wins by about 20 ms, but only because it saves enough visual
search on the common path. Set Visual search to 0 ms/item. The shortcut design
then becomes a 31 ms penalty. The entropy is still there, and now More is just
an extra stage.

<style>
  .hick-lab {
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

  .hick-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
    margin-bottom: 1rem;
  }

  .hick-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hick-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hick-lab input {
    accent-color: #0f766e;
    width: 100%;
  }

  .hick-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .hick-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .hick-lab__metric.good {
    border-color: #9ed8c5;
  }

  .hick-lab__metric.warn {
    border-color: #f2b8c4;
  }

  .hick-lab__metric span,
  .hick-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hick-lab__metric span {
    display: block;
  }

  .hick-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .hick-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hick-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="hick-hyman-lab" class="hick-lab" data-hick-hyman-lab>
  <div class="hick-lab__controls">
    <label>
      Choices: <output data-value="choices">12</output>
      <input type="range" min="3" max="32" step="1" value="12" data-param="choices">
    </label>
    <label>
      Skew: <output data-value="skew">58%</output>
      <input type="range" min="0" max="92" step="1" value="58" data-param="skew">
    </label>
    <label>
      Compatibility: <output data-value="compatibility">35%</output>
      <input type="range" min="0" max="95" step="1" value="35" data-param="compatibility">
    </label>
    <label>
      Visual search: <output data-value="search">12 ms</output>
      <input type="range" min="0" max="18" step="1" value="12" data-param="search">
    </label>
    <label>
      Shortcuts: <output data-value="shortcuts">5</output>
      <input type="range" min="0" max="31" step="1" value="5" data-param="shortcuts">
    </label>
    <label>
      More cost: <output data-value="stageCost">120 ms</output>
      <input type="range" min="0" max="360" step="10" value="120" data-param="stageCost">
    </label>
    <label>
      Trials: <output data-value="trials">900</output>
      <input type="range" min="200" max="2400" step="100" value="900" data-param="trials">
    </label>
    <label>
      Seed: <output data-value="seed">29</output>
      <input type="range" min="1" max="997" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="hick-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Hick-Hyman menu entropy lab showing choice probabilities, expected time ledger, simulated trial times, and skew sweep"></canvas>
  <p class="hick-lab__note">
    Deterministic browser experiment. The histogram simulates noisy trials from
    the displayed expected-time model; it is a visualization of assumptions, not
    a measurement of new participants. The code audit checks the entropy
    conservation identity, model receipt, and simulated-trial accounting.
  </p>
</div>
<script defer src="{{ '/assets/js/hick-hyman-lab.js?v=20260616b' | relative_url }}"></script>

Three useful switches:

1. Set Skew to 0. The entropy becomes $$\log_2 n$$. Shortcuts lose much of
   their reason to exist because there is no hot path.
2. Set Visual search to 0. The shortcut menu is now slower in the default
   scenario, because the More stage remains while the scan savings disappear.
3. Push Compatibility upward. The slope drops, so the entropy term matters less.
   That matches the HCI critique: familiar spatial mappings can make
   choice-reaction time almost constant for ordinary command selection.[^liu]

## The Lab Keeps Its Receipts

The executable artifact is
[`assets/js/hick-hyman-lab.js`]({{ '/assets/js/hick-hyman-lab.js' | relative_url }}).

The current Node audit runs `9,613` checks across menu sizes, skews,
compatibility settings, and shortcut cutoffs. It verifies:

```text
probabilities sum to one
entropy stays below the uniform log2(n) ceiling
More-stage entropy obeys the chain rule
flat, uniform, and shortcut time formulas reconcile
histograms count every simulated trial
top-path and tail-path hits partition the trials
skew reduces entropy and flat-menu time in the sweep
compatibility lowers the Hick-Hyman slope
the default numbers in the text stay pinned
```

The largest chain-rule discrepancy in the audit is about `1.8e-15`. That is the
point of the simulator: a More button can move entropy between receipts, but the
expected information charge is conserved unless some other line item changes.

## Why The Usual Design Advice Is Too Crude

The history matters here. Hick used information theory to quantify
choice-reaction tasks and estimated a roughly constant information-gain rate in
his setting.[^hick] Hyman then varied stimulus probabilities and tied reaction
time to stimulus information rather than just raw set size.[^hyman] This is
already subtler than "seven plus or minus two" folklore.

The modern review by Proctor and Schneider is careful about the same point:
the law is real, influential, and bounded by task details such as practice,
compatibility, and the kind of response being made.[^proctor-schneider] Liu,
Gori, Rioul, Beaudouin-Lafon, and Guiard are even sharper for HCI. Their CHI
2020 paper argues that Hick's law is often misread as a general design law;
many interface delays that look logarithmic are really visual search,
hierarchical navigation, memory search, or strategy.[^liu]

This is the move I want to keep:

```text
Do not ask "does Hick's law say fewer choices?"
Ask "which part of the interaction is a choice-reaction task?"
```

A menu selection usually includes several operations:

- discover or recall the target;
- scan visible candidates;
- map stimulus to response;
- move to the item;
- open another surface if needed;
- recover from misses.

Hick-Hyman touches one slice of that stack. It does not price scrolling. It does
not know whether the menu is alphabetized. It does not know whether the user is
a novice or an expert. It does not know whether "Archive" and "Delete" are too
similar under pressure.

That does not make the law useless. It makes it a component, like Fitts's law
or the keystroke-level model: a small predictive piece that becomes useful
inside a decomposition of the task.[^card]

## A Design Audit I Would Actually Run

For a production menu, I would not begin by counting items. I would begin with a
ledger.

First, estimate the prior. From logs or task studies, write down how often each
command is the target. Compute entropy. A 20-command menu with a dominant hot
path can be a smaller decision than a six-command menu whose choices are evenly
confusable.

Second, separate search from decision. If users scan labels linearly, visible
item count matters. If the menu is spatially stable and users know where things
live, it matters less. If search is the main cost, grouping and ordering can
help even when pure entropy says the grouping is neutral.

Third, price the stage. A submenu, modal, More button, or collapsed section is
not free. It buys less clutter by charging a toll to the tail. This is good only
when the hot path is hot enough, the tail is rare enough, or the stage improves
some other process by a larger amount.

Fourth, check compatibility. A spatially obvious mapping can flatten the
Hick-Hyman slope. A clever but arbitrary mapping can make it steep. Keyboard
shortcuts, stable positions, icons used by convention, and repeated practice
all change the slope rather than the entropy.

Finally, measure the whole task. Reaction time is not completion time. A design
that is 20 ms faster on first response and 400 ms worse after an error is not
better. The law gives you a term in the model, not the model.

## The One-Line Version

A menu is not slow because it has many choices. It is slow when the user has to
pay too much uncertainty, too much search, too much movement, too much staging,
or too much recovery.

Entropy is the part we can write down cleanly.

That cleanliness is useful precisely because it refuses to explain everything.

## Paper Trail

[^hick]: W. E. Hick, ["On the Rate of Gain of Information"](https://journals.sagepub.com/doi/10.1080/17470215208416600), *Quarterly Journal of Experimental Psychology*, 1952.

[^hyman]: Ray Hyman, ["Stimulus information as a determinant of reaction time"](https://pubmed.ncbi.nlm.nih.gov/13052851/), *Journal of Experimental Psychology*, 1953. DOI: [10.1037/h0056940](https://doi.org/10.1037/h0056940).

[^proctor-schneider]: Robert W. Proctor and Darryl W. Schneider, ["Hick's law for choice reaction time: A review"](https://web.ics.purdue.edu/~dws/pubs/ProctorSchneider_2018_QJEP.pdf), *Quarterly Journal of Experimental Psychology*, 2018.

[^liu]: Wanyu Liu, Julien Gori, Olivier Rioul, Michel Beaudouin-Lafon, and Yves Guiard, ["How Relevant is Hick's Law for HCI?"](https://perso.telecom-paristech.fr/rioul/publis/202001liugoririoulbeaudouinlafonguiard.pdf), CHI 2020. ACM DOI: [10.1145/3313831.3376878](https://dl.acm.org/doi/10.1145/3313831.3376878).

[^card]: Stuart K. Card, Thomas P. Moran, and Allen Newell, ["The keystroke-level model for user performance time with interactive systems"](https://dl.acm.org/doi/10.1145/358886.358895), *Communications of the ACM*, 1980.
