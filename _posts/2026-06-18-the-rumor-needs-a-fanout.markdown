---
layout: post
title: "The Rumor Needs a Fanout"
description: "Epidemic dissemination turns broadcast into repeated random contacts. Push spreads quickly at the beginning, pull cleans up the tail, and push-pull spends contact work to get both."
date: 2026-06-18 07:04:00 -0400
categories: software-engineering
series: distributed-systems
tags: [distributed-systems, gossip-protocols, epidemic-algorithms, rumor-spreading, anti-entropy, replication]
excerpt: "Gossip protocols do not make a magic broadcast tree. They buy robustness by sampling peers over and over until the tail has few places left to hide."
---

A broadcast tree has a foreman. A rumor has witnesses.

That is the practical difference between a centralized dissemination path and a
gossip protocol. The central path tries to name who forwards to whom. Gossip
lets each participant sample a few peers, repeatedly, and trusts probability to
fill in the missing edges.

The shape is old. Demers, Greene, Hauser, Irish, Larson, Shenker, Sturgis,
Swinehart, and Terry used epidemic algorithms for replicated database
maintenance at Xerox PARC: anti-entropy reconciled replicas by pairwise
exchange, while rumor mongering tried to spread recent updates cheaply before a
slower repair mechanism cleaned up the residue.[^demers] The idea survived
because it has the rare engineering smell of being both crude and useful.

The price is that "fanout 1" is not the same promise as "everyone hears it."
It is a stochastic contact budget.

## The Random Phone Call Model

The clean model is almost suspiciously small:

```text
there are n nodes
one node starts informed
time moves in rounds
each active node calls a few random peers per round
successful contacts transfer the rumor
```

This model deliberately ignores membership churn, topology, congestion,
message size, authentication, retries, backpressure, and whether the rumor is
an update, a membership change, or a cache invalidation. That is not because
those details are unimportant. It is because the core tradeoff appears before
they enter.

Push is good when the rumor is rare. One informed node calls one peer; then two
informed nodes call; then four. Early growth looks like a branching process.

Push is bad when the rumor is common. Once almost everyone has heard it, most
push contacts land on nodes that already know. The last few uninformed nodes
are hard to hit by accident.

Pull is the mirror image. It is weak at the beginning because uninformed nodes
are mostly calling other uninformed nodes. It becomes excellent near the end
because the few remaining uninformed nodes are surrounded by informed peers.

Push-pull combines the two. Karp, Schindelhauer, Shenker, and Voecking studied
this random phone-call setting and made the time/work tradeoff explicit:
random contacts can be fast, but they cannot be both perfectly time-optimal and
communication-optimal for free.[^karp]

The curve has three regions:

```text
startup:       one rumor carrier has to create a second carrier
growth:        informed nodes multiply quickly
cleanup:       the last uninformed nodes dominate the schedule
```

Most production pain lives in the cleanup region.

## Lab: Spend The Contacts

The lab below runs deterministic Monte Carlo trials for three policies on a
complete random-peer model:

```text
push:       informed nodes call random peers
pull:       uninformed nodes call random peers
push-pull:  every node calls random peers; either side can teach the other
```

The plotted curves are averages across trials. A contact is counted whether or
not it carried new information; dropped contacts are counted as work too. The
model is intentionally simple enough to audit.

<style>
  .gossip-lab {
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

  .gossip-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .gossip-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .gossip-lab__controls input {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .gossip-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .gossip-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .gossip-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.68rem;
  }

  .gossip-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .gossip-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .gossip-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .gossip-lab__metric span,
  .gossip-lab__legend,
  .gossip-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }

  .gossip-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .gossip-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 640px;
    max-width: 100%;
    width: 100%;
  }

  .gossip-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .gossip-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .gossip-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .gossip-lab__note {
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 650px) {
    .gossip-lab {
      padding: 0.85rem;
    }

    .gossip-lab__controls {
      grid-template-columns: 1fr;
    }

    .gossip-lab canvas {
      height: 900px;
    }
  }
</style>

<div class="gossip-lab" data-gossip-fanout-lab>
  <div class="gossip-lab__controls">
    <label>
      Nodes <output data-value="nodes">512</output>
      <input data-param="nodes" type="range" min="128" max="2048" step="128" value="512">
    </label>
    <label>
      Fanout <output data-value="fanout">1</output>
      <input data-param="fanout" type="range" min="1" max="4" step="1" value="1">
    </label>
    <label>
      Drop rate <output data-value="loss">4%</output>
      <input data-param="loss" type="range" min="0" max="35" step="1" value="4">
    </label>
    <label>
      Trials <output data-value="trials">32</output>
      <input data-param="trials" type="range" min="8" max="64" step="4" value="32">
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="23">
    </label>
  </div>
  <div class="gossip-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Gossip fanout simulator comparing push, pull, and push-pull rumor spreading"></canvas>
  <div class="gossip-lab__legend">
    <span><i style="background:#2563eb"></i> Push</span>
    <span><i style="background:#b45309"></i> Pull</span>
    <span><i style="background:#0f766e"></i> Push-pull</span>
    <span><i style="background:#94a3b8"></i> Contact work</span>
  </div>
  <p class="gossip-lab__note">
    Deterministic simulation. The audit checks monotone coverage, population
    bounds, and broad push-pull coverage across the configured trials.
  </p>
</div>

<script defer src="{{ '/assets/js/gossip-fanout-lab.js?v=20260618a' | relative_url }}"></script>

At the default setting, there are `512` nodes, one initial holder, fanout `1`,
and a `4%` independent contact drop rate. The exact numbers move with the seed,
but the shape is stable: push-pull usually reaches 99% coverage in far fewer
rounds than pure push or pure pull, and the late-stage redundancy is visible.

Raise **Drop rate**. Coverage remains graceful for a while because the protocol
keeps taking new random shots. Raise **Fanout**. Time drops, but contacts per
node rise. The knob is not "reliability"; it is how much random work you are
willing to buy per round.

The source is intentionally small:
[`assets/js/gossip-fanout-lab.js`]({{ '/assets/js/gossip-fanout-lab.js' | relative_url }}).

## Why Push And Pull Trade Places

Let \(i_t\) be the informed fraction at the start of a round.

In a pure push model with fanout one and no loss, each informed node chooses a
random peer. A particular uninformed node is missed by all informed callers with
probability roughly:

$$
\left(1 - {1 \over n}\right)^{n i_t} \approx e^{-i_t}.
$$

So the chance it becomes informed is about \(1-e^{-i_t}\). When \(i_t\) is
small, this is close to \(i_t\), which gives exponential-looking growth. When
\(i_t\) is near one, the remaining uninformed fraction shrinks by a constant
factor per round. That is progress, but it is tail progress.

In pure pull, each uninformed node asks one random peer. It becomes informed
with probability \(i_t\). Early on, \(i_t\) is tiny, so pull waits. Near the end,
\(i_t\) is large, so almost every uninformed node that asks gets the rumor.

Push-pull uses both facts. It pushes the seed through the branching phase and
pulls the tail closed.

This is also why the word "eventual" can hide two different meanings:

```text
eventual with repair: anti-entropy keeps reconciling until residue is gone
eventual with rumor: likely fast, but some residue may need a backup
```

Demers et al. made that distinction explicitly: rumor mongering can be an
efficient first wave, but anti-entropy is the mechanism that guarantees complete
coverage of the missed residue.[^demers]

## The Tail Is Not A Bug

If a cluster has 10,000 nodes and 9,990 already know an update, the update is
not "basically done" from the perspective of the ten remaining nodes. Those ten
nodes may be exactly the replicas, caches, or membership observers that make a
future incident confusing.

The tail is where redundancy becomes visible. Most random contacts no longer
teach anyone anything. That does not mean they were mistakes. They are the
price of not maintaining a precise broadcast tree and not requiring global
coordination.

There are several ways to spend less:

```text
stop early and rely on anti-entropy later
increase fanout for fewer rounds
track acknowledgments or rumor age
prefer topologically nearby peers
maintain partial views instead of sampling the whole population
```

Each choice changes the contract. A peer selection distribution that favors
nearby nodes can reduce expensive links, but it can also make the last distant
node harder to reach. The PARC paper is unusually grounded here: it studies
nonuniform spatial distributions because real networks have costly links, not
because uniform random choice is aesthetically wrong.[^demers]

## Membership Is A Different Rumor

SWIM is a good example of the pattern in a different coat. It separates failure
detection from membership update dissemination. Nodes periodically probe random
peers, while membership changes are spread infection-style by piggybacking on
protocol messages.[^swim] That separation matters. Detecting a failed process
and disseminating the fact of that detection are different jobs.

The lab is not a SWIM simulator. It has no suspicion state, no incarnation
numbers, no indirect pings, and no false-positive model. It only shows the
dissemination substrate: repeated random contact makes local knowledge become
common-enough knowledge without a central sender.

That "enough" deserves respect. Gossip is often the right background fabric for
membership, cache invalidation, metric sketches, and eventually consistent
replication. It is not a magic replacement for consensus, durable logs, or
linearizable reads.

## The Operational Question

When I see a gossip knob, I want to know what it buys:

```text
fanout:       contacts per round per active node
period:       wall-clock spacing between rounds
loss model:    what counts as a failed contact
stop rule:     when an informed node goes quiet
repair path:   what fixes the residue
peer sampling: uniform, topology-aware, or partial view
payload:       full state, digest, delta, or pointer
```

The implementation may be only a few lines of random peer selection. The
contract is not. Every one of those choices moves load, convergence time, and
tail probability.

That is the honest lesson of epidemic dissemination. The rumor does not need a
foreman. It does need a fanout, a repair story, and a clear account of what
"everyone heard" is allowed to mean.

[^demers]: Alan Demers, Dan Greene, Carl Hauser, Wes Irish, John Larson, Scott Shenker, Howard Sturgis, Dan Swinehart, and Doug Terry, ["Epidemic Algorithms for Replicated Database Maintenance"](https://userpages.cs.umbc.edu/kalpakis/courses/621-sp26/readings/papers/p1-demers.pdf), *Proceedings of the Sixth Annual ACM Symposium on Principles of Distributed Computing*, 1987.

[^karp]: Richard Karp, Christian Schindelhauer, Scott Shenker, and Berthold Voecking, ["Randomized Rumor Spreading"](https://archive.cone.informatik.uni-freiburg.de/pubs/rumor.pdf), *Proceedings of the 41st Annual Symposium on Foundations of Computer Science*, 2000.

[^swim]: Abhinandan Das, Indranil Gupta, and Ashish Motivala, ["SWIM: Scalable Weakly-consistent Infection-style Process Group Membership Protocol"](https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf), *DSN*, 2002.
