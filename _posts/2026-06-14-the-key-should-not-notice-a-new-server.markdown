---
layout: post
title: "Consistent Hashing Without the Surprise Move"
description: "Consistent hashing is not mostly about hashing. It is a remapping contract: when the fleet changes, only the keys that must move should move."
date: 2026-06-14 09:21:00 -0400
categories: data-systems
tags: [consistent-hashing, rendezvous-hashing, distributed-caches, load-balancing, data-systems]
excerpt: "Modulo hashing balances a static fleet and destroys locality when the fleet changes. Consistent hashing keeps most keys home when servers arrive or leave."
---

The problem with `hash(key) % N` is not that it is unfair.

It is often beautifully fair.

The problem is that it has no memory for the fleet.

If there are 12 cache servers, a key goes to `hash(key) % 12`. Add one server,
and the rule becomes `hash(key) % 13`. Almost every key gets a new answer. The
cluster did the smallest possible operational thing, adding one box, and the
hash function responded by evicting the world.

Consistent hashing is the opposite contract:

```text
when one server is added, only about 1/(N+1) of keys should move
```

The new server should receive its fair share. The old servers should keep the
keys that still belong to them. That is the whole magic. Not perfect balance.
Not cryptographic mystery. Minimal disruption.

Karger, Lehman, Leighton, Panigrahy, Levine, and Lewin introduced consistent
hashing in the context of distributed caching and hot-spot relief on the web.[^karger]
Thaler and Ravishankar's highest-random-weight mapping, now usually called
rendezvous hashing, solved a closely related request-mapping problem without a
ring: score every server for a key and choose the highest score.[^hrw] Later
systems kept adapting the same idea because membership churn is a systems fact,
not an edge case.

## Static Balance Is the Wrong Benchmark

Modulo hashing is a good static assignment rule. With a decent hash function and
many keys, each bucket gets roughly the same number.

But a distributed cache is not static. Servers fail. Autoscalers add capacity.
Load balancers drain machines. Storage systems rebalance tablets. Operators
replace hardware. Membership changes are part of the workload.

So the real assignment rule has two jobs:

1. spread keys across the current fleet,
2. preserve as many assignments as possible when the fleet changes.

Modulo hashing optimizes the first job and largely ignores the second. When
\(N\) changes to \(N+1\), the residue classes are rebuilt. A key that was
bucket 7 modulo 12 has no reason to remain bucket 7 modulo 13.

This is why cache clusters using naive modulo assignment can suffer a stampede
after resize. The new server receives traffic, yes, but so does every backing
database, object store, or origin service behind the cache, because warm keys
have been scattered away from their old homes.

The assignment function became an outage amplifier.

## The Ring Contract

The classic consistent-hashing picture puts both servers and keys on a circle.
Hash each server to points on the ring. Hash each key to one point. The key is
owned by the first server point clockwise from the key.

If a new server joins, it inserts new points into the ring. It steals arcs from
its clockwise neighbors. Keys outside those arcs do not move.

That locality is the contract:

```text
membership changes only affect nearby arcs
```

Virtual nodes make balance less lumpy. Instead of one point per server, give
each server many points. More virtual nodes approximate a smoother partition of
the ring. Fewer virtual nodes are cheaper to store and update, but produce
noisier load.

This is the first useful distinction:

```text
minimal movement and perfect balance are not the same metric
```

A ring can be wonderfully stable and still temporarily imbalanced if the arcs
are uneven. More virtual nodes buy a better balance distribution.

## Rendezvous Without the Ring

Rendezvous hashing removes the ring table. For a key \(k\) and server \(s\),
compute a score \(h(k,s)\). Assign the key to the server with the highest score.

If a new server joins, every key compares its current winner with the new
server's score. The key moves only if the new server wins. Existing servers do
not reshuffle among themselves.

That means rendezvous hashing has the same monotonicity property:

```text
adding a server moves only keys assigned to the new server
```

It is simple and elegant. The cost is lookup work: in the direct version, each
key must score every server. That can be fine for small server sets or control
planes. For very large fleets or very hot data paths, systems use variants,
tables, trees, jump hashing, or other indexing tricks.

Lamping and Veach's jump consistent hash is a particularly compact later point
in this design space: it maps a key to one of a sequentially numbered set of
buckets with minimal memory and a tiny algorithm, though it assumes bucket
numbers are dense and sequential.[^jump]

## A Remapping Lab

The lab below compares three assignment rules:

1. modulo hashing,
2. a consistent hash ring with virtual nodes,
3. rendezvous hashing.

It generates keys, assigns them to \(N\) servers, adds one server, and measures
which keys move. It also tracks count balance and hot-key weighted balance. The
"hotness" slider makes the workload more skewed: a small number of keys carry
more traffic.

<style>
  .hash-lab {
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

  .hash-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .hash-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .hash-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .hash-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hash-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .hash-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .hash-lab__metric span,
  .hash-lab__legend,
  .hash-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hash-lab__metric span {
    display: block;
  }

  .hash-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .hash-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 560px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .hash-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .hash-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .hash-lab__swatch {
    border-radius: 999px;
    display: inline-block;
    height: 0.66rem;
    width: 0.66rem;
  }

  .hash-lab__swatch--modulo {
    background: #be123c;
  }

  .hash-lab__swatch--ring {
    background: #2563eb;
  }

  .hash-lab__swatch--rendezvous {
    background: #0f766e;
  }

  .hash-lab__swatch--new {
    background: #7c3aed;
  }

  .hash-lab__note {
    margin-top: 0.55rem;
  }

  @media (max-width: 720px) {
    .hash-lab {
      padding: 0.8rem;
    }

    .hash-lab__controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .hash-lab__metrics {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }

    .hash-lab canvas {
      height: 780px;
    }
  }
</style>

<div class="hash-lab" data-consistent-hashing-lab>
  <div class="hash-lab__controls">
    <label>
      Servers <output data-value="nodes">12</output>
      <input data-param="nodes" type="range" min="3" max="40" step="1" value="12">
    </label>
    <label>
      Keys <output data-value="keys">9.0k</output>
      <input data-param="keys" type="range" min="1000" max="30000" step="1000" value="9000">
    </label>
    <label>
      Virtual nodes <output data-value="replicas">64</output>
      <input data-param="replicas" type="range" min="1" max="256" step="1" value="64">
    </label>
    <label>
      Hot-key skew <output data-value="hotness">38%</output>
      <input data-param="hotness" type="range" min="0" max="90" step="2" value="38">
    </label>
    <label>
      Seed <output data-value="seed">27</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="27">
    </label>
  </div>
  <div class="hash-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Consistent hashing remapping lab"></canvas>
  <div class="hash-lab__legend">
    <span><i class="hash-lab__swatch hash-lab__swatch--modulo"></i> modulo hashing</span>
    <span><i class="hash-lab__swatch hash-lab__swatch--ring"></i> virtual-node ring</span>
    <span><i class="hash-lab__swatch hash-lab__swatch--rendezvous"></i> rendezvous hashing</span>
    <span><i class="hash-lab__swatch hash-lab__swatch--new"></i> highlighted ring node</span>
  </div>
  <p class="hash-lab__note">
    The movement metric is key count movement after adding one server. Hot-load
    max is traffic-weighted and can be high even when key counts are balanced.
  </p>
</div>

<script defer src="{{ '/assets/js/consistent-hashing-lab.js?v=20260614a' | relative_url }}"></script>

## What the Lab Is Actually Checking

The important invariant is not the exact percentage in one run. It is where the
moved keys go.

For the ring and rendezvous hashing, every moved key after adding a server is a
key assigned to the new server. Old servers do not reshuffle keys among
themselves. The new server takes its share; the rest of the fleet stays warm.

Modulo hashing fails that monotonicity test. Most moved keys are not moving
because the new server claimed them. They are moving because every residue class
was renumbered.

That is the difference between:

```text
resize changed the ownership boundary
```

and

```text
resize changed the meaning of every bucket number
```

The virtual-node slider shows a second issue. With few virtual nodes, the ring
can be lumpy: some servers own long arcs and some own short arcs. Increasing
virtual nodes improves balance but increases ring metadata. Rendezvous hashing
often has good balance without storing a ring, but direct lookup scores every
server. There is no free implementation. There is a contract and a cost model.

## Why Hot Keys Complicate the Story

Key-count balance is not traffic balance.

If all keys are equally popular, a server with 8% of keys receives roughly 8% of
traffic. But caches and load balancers rarely see uniform traffic. A few objects
or flows can dominate. Then a perfectly fair assignment by key count can still
put too much work on one server.

Consistent hashing does not solve hot keys by itself. Karger et al.'s original
paper was also about hot spots, but consistent hashing is only one tool in that
larger problem.[^karger] Real systems add replication, request coalescing,
adaptive load shedding, power-of-two choices, lease protocols, or application
specific splitting.

This is why the lab reports hot-load max separately. A hash function can keep
remapping small and still leave you with a hot shard.

The assignment rule answers:

```text
where should this key go?
```

Hot-key mitigation asks:

```text
what if one key is too much for one server?
```

Those are different problems.

## Which Hash Should You Use?

The answer depends on the shape of the fleet.

Use a virtual-node ring when membership is arbitrary, weights matter, and a
shared ring table is acceptable. This is the mental model many engineers learn
first, and it remains useful.

Use rendezvous hashing when the server set is moderate or when the simplicity of
stateless membership scoring is more valuable than lookup cost. It handles
arbitrary server names naturally and has a clean monotonicity property.

Use jump consistent hash when buckets are dense integers and you want a compact,
fast, minimal-memory mapping.[^jump] Its constraints are real, but so is the
elegance.

Use a specialized load-balancer table, such as Maglev's permutation-based
approach, when packet-level speed, near-even backend distribution, and bounded
disruption matter together.[^maglev]

Use modulo only when the bucket count is genuinely stable, or when remapping is
cheap enough that you do not care.

That last clause is not a joke. Sometimes remapping is cheap. If the data is
ephemeral, recomputable, or already replicated everywhere, the simple rule may
win. Consistent hashing is not morally superior. It is a specific answer to a
specific pain:

```text
membership changed, but most keys should not notice
```

## The Cache Is a Memory of the Assignment Function

The reason this topic matters is not that hashes are clever. It is that caches,
connections, tablets, and shards accumulate history.

A cache line is warm because yesterday's assignment function sent the same key
to the same machine. A TCP flow is sticky because every packet in the flow keeps
landing on the same backend. A storage shard is useful because replicas know
which range or hash partition they own.

Change the assignment function and you change the meaning of that memory.

Consistent hashing protects the memory. It lets the system grow or shrink while
disturbing only the part of the key space whose owner actually changed.

That is the hidden contract behind the ring:

```text
new capacity should absorb load, not erase history
```

The key should notice the new server only when the new server is now its home.

[^karger]: David Karger, Eric Lehman, Tom Leighton, Rina Panigrahy, Mathew Levine, and Daniel Lewin, ["Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web"](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf), STOC 1997.

[^hrw]: David G. Thaler and Chinya V. Ravishankar, ["Using Name-Based Mappings to Increase Hit Rates"](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/02/HRW98.pdf), *IEEE/ACM Transactions on Networking*, 1998.

[^jump]: John Lamping and Eric Veach, ["A Fast, Minimal Memory, Consistent Hash Algorithm"](https://arxiv.org/abs/1406.2294), 2014.

[^maglev]: Daniel E. Eisenbud et al., ["Maglev: A Fast and Reliable Software Network Load Balancer"](https://research.google.com/pubs/archive/44824.pdf), NSDI 2016.
