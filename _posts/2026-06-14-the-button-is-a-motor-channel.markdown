---
layout: post
title: "A Button Is a Promise to a Hand"
description: "Fitts' law treats pointing as information transmission: distance, width, time pressure, and endpoint scatter decide whether a target is actually usable."
date: 2026-06-14 16:07:00 -0400
categories: psychology
tags: [fitts-law, hci, motor-control, speed-accuracy, interface-design, throughput]
excerpt: "A target is not just pixels. It is a tolerance interval for a noisy hand. Make it smaller, farther, or more urgent, and the user pays with time, misses, or both."
---

The pixel is a tempting unit of interface design, and also a trap.

The unit is the movement: where the hand starts, where it must land, how much
error the interface tolerates, and how much time the user feels allowed to
spend. A tiny close button is not merely a tiny rectangle. It is a demand for
precision, made under time pressure, by a body that is not a plotter.

That is why Fitts' law has survived.

It says that rapid aimed movement is not just geometry and not just reaction
time. It is a speed-accuracy bargain. Distance matters. Target width matters.
Endpoint variability matters. The elegant part is that those ingredients can be
turned into bits.

## Fitts Measured the Hand as a Channel

Paul Fitts' 1954 paper framed the human motor system using information theory.
The experiment was wonderfully physical: people tapped between metal target
plates of different widths and distances, trying to move quickly while avoiding
errors.[^fitts] The core observation was not just "farther takes longer." It was
that amplitude, duration, and variability are tied together.

For a pointing task, modern HCI work often uses the Shannon formulation of the
index of difficulty:

```text
ID = log2(A / W + 1)
```

where `A` is movement amplitude and `W` is target width. MacKenzie helped bring
Fitts' law into HCI as a research and design tool, including this information
theoretic interpretation for pointing tasks.[^mackenzie]
The same measurement frame also made pointing devices comparable: Card,
English, and Burr used target acquisition tasks to evaluate a mouse, joystick,
step keys, and text keys for CRT text selection, with the mouse fastest in
their study.[^card]

The formula has the right practical smell:

- move twice as far, and the task gets harder;
- make the target twice as wide, and the task gets easier;
- the change is logarithmic, so the first few pixels of tolerance matter more
  than the hundredth.

This is not a law of pixels. It is a law of tolerated error.

## The Rectangle Is Not the Target

Design tools make target size look exact. A button is 24 px wide. An icon is 18
px. A menu item has 8 px padding. These facts are real, and still incomplete.

The user does not generate a perfect point at the target center. The endpoint is
a distribution. If that distribution is narrow relative to the target, the click
feels easy. If the distribution spills over the target boundary, the interface
collects misses.

The same physical target can also mean different things in different contexts:

- a mouse on a desk;
- a thumb on a phone;
- a finger on a moving train;
- a stylus on a tablet;
- a cursor crossing a high-DPI display;
- a user rushing because a popup is about to disappear.

The target is not just the rectangle. It is the rectangle plus the endpoint
cloud the user brings to it.

## Make the Target Cheap or Expensive

The lab below is a deterministic toy. It simulates a one-dimensional pointing
task with endpoint scatter. It reports both nominal difficulty, based on the
designed distance and width, and effective difficulty, based on the observed
spread of endpoints.

The important measurement trick comes from pointing-device evaluation practice.
Soukoreff and MacKenzie recommend measuring endpoint scatter and converting
physical difficulty into effective difficulty.[^soukoreff] A common effective
target width is:

```text
We = 4.133 * SDx
```

where `SDx` is the standard deviation of endpoints along the movement axis. The
constant corresponds to a normally distributed endpoint spread covering about 96
percent of selections. Throughput is then computed from effective difficulty
and movement time, so speed and accuracy are not separated into two convenient
lies.

<div class="fitts-law-lab" data-fitts-law-lab>
  <div class="fitts-law-lab__controls">
    <label>
      Amplitude <output data-value="amplitude">420 px</output>
      <input type="range" data-param="amplitude" min="120" max="760" step="10" value="420" aria-label="Amplitude">
    </label>
    <label>
      Target width <output data-value="width">44 px</output>
      <input type="range" data-param="width" min="12" max="160" step="2" value="44" aria-label="Target width">
    </label>
    <label>
      Speed pressure <output data-value="urgency">28%</output>
      <input type="range" data-param="urgency" min="0" max="100" step="2" value="28" aria-label="Speed pressure">
    </label>
    <label>
      Motor variability <output data-value="motorNoise">6 px</output>
      <input type="range" data-param="motorNoise" min="0" max="28" step="1" value="6" aria-label="Motor variability">
    </label>
    <label>
      Trials <output data-value="trials">180</output>
      <input type="range" data-param="trials" min="60" max="420" step="20" value="180" aria-label="Trials">
    </label>
  </div>
  <div class="fitts-law-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Fitts law pointing simulator showing target geometry, endpoint scatter, movement-time model, effective width, and speed-accuracy throughput"></canvas>
  <div class="fitts-law-lab__legend">
    <span><i style="background:#0f766e"></i>Target</span>
    <span><i style="background:#7c3aed"></i>Endpoint hits</span>
    <span><i style="background:#be123c"></i>Misses</span>
    <span><i style="background:#b45309"></i>Effective width</span>
    <span><i style="background:#2563eb"></i>Fitts trend</span>
  </div>
  <p class="fitts-law-lab__note">
    Deterministic toy model. It is not a user study and it is not calibrated to
    a particular device. It isolates the design geometry: amplitude, target
    width, endpoint scatter, movement time, miss rate, and effective throughput.
  </p>
</div>

<script defer src="{{ '/assets/js/fitts-law-lab.js' | relative_url }}"></script>

Start with the default. The designed task is about 3.40 bits. The endpoint
scatter is a little wider than the target, so the effective width is larger
than 44 px and the effective difficulty is lower than the nominal difficulty.
That is not a contradiction. It means the simulated user is partly buying speed
with errors.

Make the target narrower. Nominal difficulty rises and misses climb. Make the
target wider. Movement time falls, but throughput may not improve forever,
because users can use the extra width as slop rather than precision.

Now push **Speed pressure** upward. Mean movement time falls, but the endpoint
distribution spreads. At some settings throughput still improves; at others the
miss rate becomes the real cost. This is the point of measuring throughput from
effective width instead of only measuring "time to click."

Finally raise **Motor variability**. The designed button did not change. The
effective target changed anyway.

## Edges Cheat, Usefully

Fitts' law also explains one of the oldest UI tricks: screen edges are special.

If the pointer cannot travel past a screen boundary, an edge target has a kind
of huge effective width in the direction of the edge. A menu bar at the top of
the screen, a scrollbar against the side, or a corner hot spot can be easier to
hit than its visible pixels suggest because overshoot is absorbed by the
boundary.

The reverse is also true. A small icon floating in the middle of a dense toolbar
is expensive because both undershoot and overshoot matter. On a touchscreen,
the finger hides the target and adds occlusion. On a mobile interface, the
thumb's comfortable reach region changes the amplitude before the user even
starts moving.

The design lesson is not "make every button huge." It is more selective:

```text
spend target width where mistakes are costly, frequent, or rushed
```

Delete buttons, close buttons, destructive actions, tiny resize handles, and
transient menus do not have the same motor budget as leisurely navigation.

## Fast Only Counts If You Land

The strongest part of the HCI standardization work is its refusal to let speed
pretend to be the whole outcome. Soukoreff and MacKenzie argue for throughput
as a dependent measure that reflects both movement time and accuracy, averaged
over the task conditions.[^soukoreff]

That matters because a fast interface can be fake-fast.

If one design encourages reckless clicks, the raw movement time may look great.
But if users miss, correct, undo, or hesitate next time, the system has merely
moved time from the measured interval into the unmeasured recovery path.

This is familiar outside HCI:

- a search engine that returns quickly but makes users reformulate;
- an autocomplete that saves keystrokes but inserts wrong text;
- a recommender that maximizes clicks and burns trust;
- an API that is low latency until retries enter the picture.

Speed without error accounting is an unfinished measurement.

## The Review I Would Rather Have

For a serious interface, I would rather see a small motor budget table than a
debate about whether a button "looks balanced."

- What are the high-frequency targets?
- What are the high-consequence targets?
- What are the rushed targets?
- What is the movement amplitude from the previous likely state?
- Does an edge or corner help by absorbing overshoot?
- Does the target have enough width for the device and posture?
- What happens when the user is tired, moving, anxious, or using one hand?
- Are we measuring miss corrections, undo events, hover hesitation, and repeat
  attempts?

Fitts' law does not answer all of those questions. It keeps them honest.

The button is not a rectangle. It is a promise to a noisy hand.

[^fitts]: Paul M. Fitts, ["The Information Capacity of the Human Motor System in Controlling the Amplitude of Movement"](https://www.lri.fr/~mbl/ENS/FONDIHM/2013/papers/Fitts-JEP54.pdf), *Journal of Experimental Psychology*, 1954.

[^mackenzie]: I. Scott MacKenzie, ["Fitts' Law as a Research and Design Tool in Human-Computer Interaction"](https://www.yorku.ca/mack/hci1992.pdf), *Human-Computer Interaction*, 1992.

[^soukoreff]: R. William Soukoreff and I. Scott MacKenzie, ["Towards a standard for pointing device evaluation, perspectives on 27 years of Fitts' law research in HCI"](https://www.yorku.ca/mack/ijhcs2004.pdf), *International Journal of Human-Computer Studies*, 2004.

[^card]: Stuart K. Card, William K. English, and Betty J. Burr, ["Evaluation of Mouse, Rate-Controlled Isometric Joystick, Step Keys, and Text Keys for Text Selection on a CRT"](https://www.tandfonline.com/doi/abs/10.1080/00140137808931762), *Ergonomics*, 1978. A Xerox PARC technical report copy is archived at [Bitsavers](https://bitsavers.trailing-edge.com/pdf/xerox/parc/techReports/SSL-77-1_Evaluation_of_Mouse_Rate-Controlled_Isometric_Joystick_Step_Keys_and_Text_Keys_for_Text_Selection_on_a_CRT.pdf).
