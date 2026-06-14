---
layout: post
title: "Rollback Netcode Is Speculative Execution"
description: "Rollback netcode does not make packets faster. It moves online games from waiting to speculating: predict the missing input, run the frame now, and repair the timeline when reality arrives."
date: 2026-06-14 00:46:00 -0400
categories: gaming
tags: [rollback-netcode, game-networking, latency-compensation, deterministic-simulation, multiplayer, software-engineering]
excerpt: "The network still has latency. Rollback changes what latency feels like: local input stays sharp, and the cost is paid later as prediction error, re-simulation, and occasional visual correction."
---

The packet is still late.

That is the first thing to keep honest. Rollback netcode does not make fiber
shorter, routers kinder, Wi-Fi cleaner, or the other player closer. The speed of
light remains rude. The network still delivers remote input after the local
frame wanted to use it.

What changes is the question the game asks.

The old question is:

```text
Can I run this frame yet?
```

Rollback asks:

```text
What if I run it now, and fix the past if I guessed wrong?
```

That is speculative execution. The game predicts a missing input, advances the
simulation, renders the result, and keeps enough history to repair itself when
the real input arrives.

The latency did not disappear. It changed form.

## Waiting Is Correct

The most conservative multiplayer protocol is beautiful in the way a theorem is
beautiful. If every machine runs the same deterministic simulation, then the
machines do not need to exchange the whole world. They only need to exchange
the inputs.

At frame `t`, every peer waits until it has every player's input for frame `t`.
Then all peers execute the same code:

```text
state[t + 1] = step(state[t], inputs[t])
```

If `step` is deterministic and every peer sees the same `inputs[t]`, the worlds
stay identical.

This is the deep trick behind classic lockstep networking. Bettner and Terrano's
Age of Empires paper is still worth reading because it describes the engineering
pressure so concretely: thousands of units, eight players, a 28.8 modem target,
and an existing single-threaded engine that could not simply ship full world
state every update.[^aoe]

Lockstep is honest. It makes consistency easy to reason about. It also turns
network delay into input delay. If the remote input is late, the frame waits.
If the game adds a fixed input buffer, local controls wait too. The better the
consistency story, the more the player may feel the network in their hands.

For some games, this is acceptable. A strategy game can hide delay behind turns,
command queues, or animation. A fighting game has a harsher contract. A jab,
block, parry, throw tech, jump cancel, or one-frame link depends on muscle
memory. Adding five to eight frames of delay can change the game the player
learned offline.

So the protocol needs to sin.

## Prediction Is a Controlled Sin

Client-side prediction is older than the current rollback discourse. In
Bernier's Half-Life paper, the client sends commands to the server but also
simulates local movement immediately, then reconciles against the authoritative
server result when it comes back.[^bernier]

That idea changes the feel of a first-person shooter. The player does not press
forward and wait a round trip for the server to acknowledge that walking is
allowed. The client moves now. If the server later disagrees, the client is
corrected.

The same family of ideas includes interpolation and lag compensation. The
shooter client often sees itself in the present and other entities slightly in
the past. For hitscan weapons, the server may rewind the world to the shooter's
view time before testing the shot.[^gambetta] Bernier describes this as stepping
back in server time so the command is evaluated against the state the player
actually saw.[^bernier]

These systems are not lies. They are negotiated illusions.

Rollback netcode applies the same philosophical move to deterministic
peer-to-peer games. GGPO's public explanation is wonderfully direct: in a fully
deterministic peer-to-peer engine, the game can proceed with local input while
predicting missing remote inputs; when the real inputs arrive, the game compares
them with the predictions and re-simulates from the divergence if needed.[^ggpo]
The open-source SDK asks the game to provide the three verbs that make this
possible: save state, load state, and execute a frame without rendering.[^ggpo-github]

That is the whole bargain.

```text
save the past
guess the missing input
run the present
repair the past
```

## The Branch Predictor Is Holding a Controller

The CPU metaphor is imperfect, but useful.

A processor does not always wait to know which way a branch will go. It predicts
the branch, speculatively executes instructions, and throws work away if the
prediction was wrong. The win is keeping the pipeline full. The cost is a
misprediction flush.

Rollback does the same thing with player input.

At frame `t`, remote input has not arrived. The game predicts it. A common
prediction is boring and effective:

```text
remote_input[t] = remote_input[t - 1]
```

In many games, inputs are locally autocorrelated. If the other player was
holding back last frame, they are likely holding back this frame. If they were
neutral last frame, neutral is often a better guess than a random button.

Then the real input arrives:

```text
if actual_input[k] != predicted_input[k]:
    load_state(k)
    replace predicted_input[k] with actual_input[k]
    for f in k..current:
        step(state, inputs[f])
```

If the prediction was right, nobody notices. If it was wrong, the local machine
has to make the present consistent with the corrected past. That may mean a
small visual pop, a character snapping a little, a whiff becoming a hit, a sound
effect needing suppression, or a burst of CPU work to re-simulate several
frames inside one render frame.

The protocol has not removed latency. It has converted some of it into
prediction risk.

## A Rollback Lab

The lab below simulates four seconds of a tiny deterministic two-player game.
Only the remote player's one-dimensional input is uncertain. The local client
receives those remote inputs after a one-way network delay derived from RTT and
jitter.

Two policies are compared:

1. **Input-delay lockstep:** wait long enough for the remote input before
   executing the frame. If the buffer is too short, the frame stalls.
2. **Rollback:** apply local input after the chosen buffer, predict any missing
   remote input, save history, and re-simulate when a late input disagrees.

The model is deliberately small. It is not a GGPO implementation, not a fighting
game engine, and not a benchmark. It is an executable microscope for the design
tradeoff.

<style>
  .rollback-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rollback-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }

  .rollback-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rollback-lab__controls input {
    accent-color: #be123c;
    width: 100%;
  }

  .rollback-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .rollback-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rollback-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.7rem;
  }

  .rollback-lab__metric span,
  .rollback-lab__legend,
  .rollback-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rollback-lab__metric span {
    display: block;
  }

  .rollback-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .rollback-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .rollback-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.8rem;
  }

  .rollback-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rollback-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .rollback-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div class="rollback-lab" data-rollback-netcode-lab>
  <div class="rollback-lab__controls">
    <label>
      Round-trip time: <output data-value="rtt">80ms</output>
      <input type="range" min="20" max="220" step="5" value="80" data-param="rtt">
    </label>
    <label>
      Jitter: <output data-value="jitter">14ms</output>
      <input type="range" min="0" max="90" step="1" value="14" data-param="jitter">
    </label>
    <label>
      Input buffer: <output data-value="inputDelay">2f</output>
      <input type="range" min="0" max="8" step="1" value="2" data-param="inputDelay">
    </label>
    <label>
      Remote volatility: <output data-value="volatility">24%</output>
      <input type="range" min="0" max="100" step="1" value="24" data-param="volatility">
    </label>
    <label>
      Rollback window: <output data-value="rollbackWindow">8f</output>
      <input type="range" min="2" max="16" step="1" value="8" data-param="rollbackWindow">
    </label>
    <label>
      Re-sim cost: <output data-value="simCost">18%</output>
      <input type="range" min="5" max="80" step="1" value="18" data-param="simCost">
    </label>
  </div>
  <div class="rollback-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Rollback netcode simulator comparing input delay, lockstep stalls, prediction windows, rollbacks, prediction error, and re-simulation cost"></canvas>
  <div class="rollback-lab__legend">
    <span><i style="background:#be123c"></i> Rollback correction</span>
    <span><i style="background:#7c3aed"></i> Predicted remote input</span>
    <span><i style="background:#2563eb"></i> Lockstep stall pressure</span>
    <span><i style="background:#d97706"></i> Prediction error</span>
    <span><i style="background:#172026"></i> True remote state</span>
  </div>
  <p class="rollback-lab__note">
    Deterministic toy model at 60 frames per second. It models input timing,
    prediction, rollback, and re-simulation pressure, not a complete commercial
    engine or real network stack.
  </p>
</div>
<script src="{{ '/assets/js/rollback-netcode-lab.js?v=20260614a' | relative_url }}"></script>

Start with the default. The input buffer is only two frames, about 33 ms. That
is far below the round-trip time, so a pure lockstep system would frequently
discover that the needed remote input is not available yet. Rollback does not
wait. It predicts, occasionally corrects, and keeps local input sharp.

Raise **input buffer**. The tradeoff panel moves right. Lockstep stalls fall
because more packets arrive before their inputs are needed. Rollbacks also fall
because the prediction horizon is shorter. The price is immediate: every extra
frame of buffer is one more frame between pressing a button and seeing your own
character obey.

Raise **remote volatility**. Last-input prediction gets worse. This is why
rollback loves stable input and hates sudden changes. Holding back is easy to
predict. A reversal, dash, parry, or button press is exactly the kind of event
that matters and exactly the kind of event the predictor did not know.

Raise **jitter** while keeping RTT fixed. Average latency is not the whole
problem. A stable 80 ms can be buffered. A spiky 80 ms forces a choice between
larger delay, more rollbacks, or occasional hard correction.

Raise **re-sim cost**. The visual correction may still be small, but the engine
budget becomes fragile. A rollback of six frames means six deterministic updates
must fit into the current frame, often alongside the normal update, rendering
prep, audio, input, and scripting.

## The Hard Part Is Not the Network

The network code is hard. The game code may be harder.

Rollback wants determinism. Not "usually the same". Exactly the same. Given the
same saved state and the same input stream, the next frame must produce the same
state on every peer.

That requirement has teeth:

1. Random numbers must be seeded and consumed deterministically.
2. Floating-point behavior must not drift across platforms or compiler settings.
3. State that affects gameplay must be inside the saved snapshot.
4. Rendering, particles, camera shake, rumble, and audio cannot blindly fire
   during speculative frames and then fire again during re-simulation.
5. Loading an old state must be cheap enough to happen in a frame budget.

This is why rollback is not a library you sprinkle on top at the end. It is a
constraint on engine architecture. GGPO can provide the protocol machinery, but
the game still has to be written so state can be saved, restored, and advanced
deterministically.[^ggpo]

The state boundary becomes a product decision. If a dust particle has no
gameplay effect, maybe it should not be rolled back. If a projectile, hurtbox,
meter value, cooldown, invulnerability timer, or random seed affects gameplay,
it must belong to the deterministic timeline.

The joke version is:

```text
netcode is a serialization format with opinions about time
```

The serious version is that rollback makes temporal correctness observable.

## Fairness Is Not One Thing

Latency compensation often trades one player's truth against another's.

In shooters, lag compensation can produce the familiar "shot behind cover"
complaint. The shooter aimed at a past version of the target. The server
rewound and honored that shot. From the target's current viewpoint, they had
already escaped. Bernier is explicit that this is a game-design tradeoff, not a
free lunch.[^bernier]

Rollback games have a different flavor of unfairness. Your own controls may
feel offline, but the opponent can snap into the corrected timeline after their
late input arrives. If the rollback window is too small, the game may have to
accept a hard correction or desync risk. If the window is large, the repair can
be more correct but more visible and more expensive.

The survey literature uses a broad umbrella for these techniques: latency
compensation manipulates inputs and/or game states in response to network
delay.[^survey] That phrasing is useful because it avoids mythology. The
designer is not eliminating latency. The designer is choosing how to manipulate
time so the most important part of the experience survives.

Different genres choose differently:

1. An RTS can prefer deterministic lockstep and command delay.
2. A shooter can prefer client prediction, interpolation, and server rewind.
3. A fighting game can prefer rollback because local timing is sacred.
4. A racing game can use prediction and smoothing because continuous motion can
   tolerate small spatial error.
5. A party game may hide inconsistency with generous rules and animation.

The correct protocol is the one whose artifacts fit the game.

## Local Lag and Timewarp

Rollback did not appear from nowhere. Distributed simulation has long had the
same shape: delay local execution to reduce inconsistencies, or execute now and
repair later.

Mauve, Vogel, Hilt, and Effelsberg describe this tradeoff in terms of
**local-lag** and **timewarp** for replicated continuous applications.[^mauve]
Local-lag deliberately reduces responsiveness so operations are more likely to
arrive before execution. Timewarp repairs short-term inconsistencies after the
fact. The paper's vocabulary is academic, but the game-feel version is exactly
the slider in the lab:

```text
more local lag -> fewer repairs
less local lag -> more repairs
```

Rollback netcode lives on that frontier.

It becomes attractive when the cost of waiting is worse than the cost of being
wrong briefly.

## Why It Works So Well for Fighting Games

Fighting games are unusually friendly to rollback for several reasons.

The simulation is compact. Two characters, projectiles, timers, hitboxes,
meter, stage state, and RNG are much smaller than a giant world full of
independent AI and physics objects.

The input stream is small. A direction and a handful of buttons per frame are
cheap to send, store, predict, and compare.

The timestep is fixed. Frames are the language of the game. Players already
talk about startup, active frames, recovery, links, cancels, and invulnerability
in frame units.

The product requirement is brutal and clear. Local timing must feel like
offline. If the player's own jab waits for the network, the illusion fails
before the match becomes strategically interesting.

Rollback matches those constraints. It keeps local timing crisp and spends its
budget on the opponent's correction.

But this is also why the technique can be harder in other genres. A large,
nondeterministic, physics-heavy, many-player simulation may have too much state
to save and too much work to re-simulate. Hidden information can make peer-to-
peer input exchange unacceptable. Server authority may be required for cheating,
scale, moderation, or economy integrity.

The lesson is not "everything should be GGPO". The lesson is more general:

```text
interactive systems need a latency budget and a correction budget
```

Rollback is one particularly elegant way to spend them.

## The Design Rule

When an online game feels bad, players say "lag". That word hides several
different failures:

1. local input latency;
2. remote entity latency;
3. prediction error;
4. correction visibility;
5. server disagreement;
6. jitter and packet loss;
7. CPU spikes during recovery.

Rollback is powerful because it protects the first item. It is dangerous when
engineers forget the rest.

The implementation checklist is not glamorous:

1. fixed timestep;
2. deterministic gameplay state;
3. compact snapshots;
4. replayable input log;
5. strict separation of gameplay from visual/audio side effects;
6. resimulation budget;
7. desync detection;
8. telemetry for rollback depth, prediction misses, and frame spikes.

That last item matters. Do not only ask whether ping is low. Ask how often the
game corrected the past, how many frames it re-simulated, whether players saw
the correction, and whether the CPU had room to pay the debt.

The network cannot promise a single present shared by everyone. A real-time
game has to manufacture one.

Rollback manufactures it by treating the present as a hypothesis.

[^aoe]: Paul Bettner and Mark Terrano, "1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond," presented at GDC 2001. PDF: [zoo.cs.yale.edu/classes/cs538/readings/papers/terrano_1500arch.pdf](https://zoo.cs.yale.edu/classes/cs538/readings/papers/terrano_1500arch.pdf).

[^bernier]: Yahn W. Bernier, "Latency Compensating Methods in Client/Server In-game Protocol Design and Optimization," Valve, GDC 2001. PDF mirror: [gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf](https://www.gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf).

[^gambetta]: Gabriel Gambetta, "Fast-Paced Multiplayer, Part IV: Lag Compensation," with a concise explanation of client prediction, interpolation, and server-side rewind: [gabrielgambetta.com/lag-compensation.html](https://www.gabrielgambetta.com/lag-compensation.html).

[^ggpo]: GGPO official site, "Rollback Networking SDK for Peer-to-Peer Games," describing deterministic peer-to-peer rollback, input prediction, and re-simulation: [ggpo.net](https://www.ggpo.net/).

[^ggpo-github]: Tony Cannon / pond3r, *GGPO: Good Game, Peace Out Rollback Network SDK*, MIT-licensed source repository: [github.com/pond3r/ggpo](https://github.com/pond3r/ggpo).

[^survey]: Shengmei Liu, Xiaokun Xu, and Mark Claypool, "A Survey and Taxonomy of Latency Compensation Techniques for Network Computer Games," *ACM Computing Surveys* 54, no. 11S, Article 243, 2022. DOI: [10.1145/3519023](https://doi.org/10.1145/3519023). Author page: [web.cs.wpi.edu/~claypool/papers/lag-taxonomy](https://web.cs.wpi.edu/~claypool/papers/lag-taxonomy/).

[^mauve]: Martin Mauve, Jorg Vogel, Volker Hilt, and Wolfgang Effelsberg, "Local-lag and Timewarp: Providing Consistency for Replicated Continuous Applications," *IEEE Transactions on Multimedia* 6, no. 1, 2004. PDF: [publications.cs.hhu.de/library/Mauve2004a.pdf](https://publications.cs.hhu.de/library/Mauve2004a.pdf).
