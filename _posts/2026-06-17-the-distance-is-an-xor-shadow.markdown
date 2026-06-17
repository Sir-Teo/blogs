---
layout: post
title: "The Distance Is an XOR Shadow"
description: "Kademlia routes through a distributed hash table by treating closeness as XOR distance. That turns lookup into a prefix game with k-buckets, stale contacts, and parallel probes."
date: 2026-06-17 03:35:00 -0400
categories: computer-science
tags: [kademlia, distributed-hash-table, peer-to-peer, xor-metric, routing, distributed-systems]
excerpt: "A Kademlia lookup is not walking around a ring. It is shaving off the most significant bit where the key and the candidate disagree."
---

Most hash tables have a table.

Kademlia has strangers.

A node wants a key. It does not know the owner. It knows a few other nodes,
arranged by how their IDs differ from its own ID. It asks the closest strangers
it knows. They return closer strangers. The search keeps tightening until the
frontier stops improving.

That sounds like folklore until you notice the metric.

Kademlia's distance is:

```text
distance(x, y) = x XOR y
```

interpreted as an unsigned integer.

The first differing bit dominates the distance. If two IDs share many leading
bits, their XOR has many leading zeros, and the integer is small. Closeness is a
prefix contract.

That one choice makes the routing table feel almost inevitable.

## The Metric Is Weird in Useful Ways

The original Kademlia paper by Maymounkov and Mazieres frames the system around
the XOR topology.[^kademlia] The paper points out three properties that are easy
to underestimate:

```text
d(x, x) = 0
d(x, y) = d(y, x)
for any x and distance delta > 0, there is exactly one y with d(x, y) = delta
```

Symmetry means that the nodes you query are drawn from the same kind of
neighborhoods that belong in your own routing table. A received query is also
fresh routing information.

Unidirectionality means lookups for the same key tend to converge along the
same path, which makes caching along that path meaningful. If two people ask for
the same hot key, their searches are likely to collide with the same useful
intermediate nodes.

The distance is not geographic.

It is a shadow cast by bits.

## Buckets Are Prefix Ranges

For a 160-bit ID space, Kademlia stores contacts in buckets indexed by distance
range:

```text
bucket i: contacts whose XOR distance is in [2^i, 2^(i+1))
```

In the original paper, each node keeps a k-bucket for every such range; each
bucket stores up to `k` contacts and is ordered by time last seen.[^kbuckets]
The least-recently seen contact is not thrown away just because a new contact
appears. Kademlia first checks whether the old contact is still alive. If it is,
the old live contact stays.

That policy is not only sentimentality for elders. The paper uses measurements
from peer-to-peer systems to motivate the idea that nodes with longer current
uptime are more likely to remain online. In that environment, an old live peer
is a good thing.

There is a second benefit: a flood of new node IDs does not automatically flush
your routing table. The table has a memory.

BitTorrent's Mainline DHT keeps the same core idea in a production protocol:
node IDs live in the same 160-bit space as infohashes, XOR defines closeness,
and a node iteratively asks the closest nodes it knows for closer contacts.[^bep5]

## The Lab

The lab below uses a small 16-bit ID space so the structure is visible. It is
not a BitTorrent implementation. It is a microscope:

```text
generate live and stale nodes
build XOR k-buckets for every node
start from one source node
query up to alpha closest unqueried candidates per round
audit against the true globally closest live node
```

The default setting is intentionally imperfect: patchy neighborhoods, `k=4`,
`alpha=2`, and 35% stale contacts. The highlighted lookup succeeds, but the
bucket-size sweep shows that `k=2` fails in many nearby seeds while larger
buckets recover.

<style>
  .kad-lab {
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

  .kad-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .kad-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .kad-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .kad-lab select,
  .kad-lab input[type="range"] {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .kad-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .kad-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 1rem;
  }

  .kad-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.68rem 0.72rem;
  }

  .kad-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .kad-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.84rem, 2.35vw, 1.04rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .kad-lab__metric.good strong {
    color: #0f766e;
  }

  .kad-lab__metric.bad strong {
    color: #be123c;
  }

  .kad-lab__metric.warn strong {
    color: #d97706;
  }

  .kad-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .kad-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .kad-lab {
      padding: 0.75rem;
    }

    .kad-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="kademlia-xor-lab" class="kad-lab" data-kademlia-xor-lab>
  <div class="kad-lab__controls">
    <label>
      Network
      <select data-param="scenario" aria-label="Kademlia network scenario">
        <option value="patchy" selected>patchy table</option>
        <option value="uniform">uniform ids</option>
        <option value="hotkey">hot prefix</option>
      </select>
      <span data-value="scenario">patchy table</span>
    </label>
    <label>
      Nodes
      <input type="range" min="40" max="420" step="10" value="220" data-param="nodes" aria-label="Number of DHT nodes">
      <span><output data-value="nodes">220</output> nodes</span>
    </label>
    <label>
      Bucket size k
      <input type="range" min="2" max="32" step="1" value="4" data-param="bucketSize" aria-label="K-bucket size">
      <span data-value="bucketSize">4</span>
    </label>
    <label>
      Parallelism alpha
      <input type="range" min="1" max="8" step="1" value="2" data-param="alpha" aria-label="Lookup parallelism">
      <span data-value="alpha">2</span>
    </label>
    <label>
      Stale contacts
      <input type="range" min="0" max="55" step="1" value="35" data-param="stalePct" aria-label="Percentage of stale contacts">
      <span data-value="stalePct">35%</span>
    </label>
    <label>
      Seed
      <input type="range" min="1" max="9999" step="1" value="41" data-param="seed" aria-label="Random seed">
      <span data-value="seed">41</span>
    </label>
  </div>
  <div class="kad-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="720" aria-label="Kademlia XOR lookup lab showing ID-space trace, source k-buckets, iterative lookup ledger, and bucket-size success frontier"></canvas>
  <p class="kad-lab__note">
    The lab uses 16-bit IDs for legibility. Real Kademlia-style systems commonly
    use much larger ID spaces, richer peer records, timeouts, refresh logic,
    provider records, validation, and implementation-specific termination rules.
  </p>
</div>

<script defer src="{{ '/assets/js/kademlia-xor-lab.js?v=20260617a' | relative_url }}"></script>

The linear ID-space trace is a little misleading on purpose. It shows where IDs
sit numerically, because that is easy to draw. But the lookup is not minimizing
ordinary numeric distance. It is minimizing XOR distance to the target.

That is why a node can look far away on the line and still be a better prefix
match.

## The Lookup Is a Candidate Race

The modern libp2p Kademlia spec describes the lookup state in almost the same
language as the lab: maintain a set of already queried peers and a set of next
query candidates sorted by XOR distance to the key; query up to `alpha`
candidate peers; add closer peers from responses; terminate after enough close
peers have answered.[^libp2p]

That is a race between candidates.

```text
candidate set: what I have heard of
queried set:   what I have already asked
frontier:      closest candidates not yet exhausted
```

When a queried node is live, it returns the closest contacts it knows. When a
queried contact is stale, the lookup spends a timeout and learns nothing. The
whole reason to query several candidates at once is to make a stale contact a
delay, not a stop sign.

The lab's default run finds the true owner in two rounds:

```text
rounds:   2
queries:  4
timeouts: 1
```

That timeout is not decorative. It is why `alpha` exists.

## What k Buys

The bucket-size frontier sweeps `k` while keeping the same scenario family. It
does not claim a universal law. It is a local stress test.

In this default setup:

```text
k = 2  succeeds in about 61% of nearby seeds
k = 4  succeeds in about 94%
k >= 6 succeeds in this sweep
```

The shape is the point. A larger bucket is not merely "more memory." It is more
redundant evidence in each prefix range. If one contact is stale, another may
still bridge the next prefix gap.

Kademlia's original `k=20` example was chosen to make simultaneous failure of
the relevant contacts unlikely over the refresh interval.[^kbuckets] The exact
number is not sacred. The product requirement is:

```text
enough contacts per range
fresh enough under churn
cheap enough to maintain
```

## The Security Problem Is ID Choice

The clean mental model assumes random node IDs. That assumption is doing
serious work.

If an attacker can cheaply choose many IDs near a target key, the prefix game
becomes an eclipse game. The attacker does not need to break XOR. It can try to
occupy the neighborhood the lookup is trying to reach.

S/Kademlia was one practical response: use public-key-derived identities,
crypto puzzles, sibling lists, and multiple disjoint lookup paths to reduce the
damage from Sybil and eclipse attacks.[^skademlia] The paper is a useful
reminder that Kademlia's elegant routing table is not, by itself, a complete
security model.

That distinction matters in real deployments:

```text
the metric gives you a routing geometry
the admission rules decide who gets to place points in it
```

If node IDs are free to mint and free to choose, the geometry can be crowded by
an adversary.

## The Shape I Keep

A Kademlia lookup is a distributed nearest-neighbor search in a discrete metric
space.

Every useful response should do one of two things:

```text
move the frontier closer to the target
prove that a candidate path is stale
```

The XOR metric makes "closer" a prefix statement. The k-buckets make sure a node
does not need to know the whole network, only representatives at exponentially
wider distance ranges. The alpha parameter lets the lookup spend a little extra
bandwidth to avoid waiting for a single dead contact.

This is the compact design:

```text
prefix geometry
bounded memory
iterative discovery
parallel doubt
```

The table is not the hash table.

The table is the rumor network that lets the hash table exist.

## Reproducibility Notes

The executable artifact is
[`assets/js/kademlia-xor-lab.js`]({{ '/assets/js/kademlia-xor-lab.js' | relative_url }}).

The implementation builds:

```text
16-bit node IDs
XOR distance and bucket indexing
per-node k-buckets with stale contacts
alpha-parallel iterative FIND_NODE-style lookup
global nearest-live-node audit
bucket-size success frontier across nearby seeds
```

The audit checks:

```text
XOR symmetry and unidirectionality
bucket index boundaries
contacts placed in matching source buckets
FIND_NODE-style responses capped at k and sorted by XOR distance
best seen distance never increases during lookup
perfect small tables find the true owner
```

The real systems have more machinery. This toy keeps the part that I think is
worth holding in your head:

```text
XOR distance turns a network lookup into a prefix race.
```

[^kademlia]: Petar Maymounkov and David Mazieres, ["Kademlia: A Peer-to-peer Information System Based on the XOR Metric"](https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf), IPTPS 2002. The Springer page is ["A Peer-to-Peer Information System Based on the XOR Metric"](https://link.springer.com/chapter/10.1007/3-540-45748-8_5).

[^kbuckets]: Maymounkov and Mazieres, "Kademlia," Section 2.1, on k-buckets, least-recently seen ordering, and keeping old live contacts.

[^bep5]: Andrew Loewenstern and Arvid Norberg, ["BEP 5: DHT Protocol"](https://www.bittorrent.org/beps/bep_0005.html), BitTorrent Enhancement Proposals. The overview describes node IDs, XOR distance, iterative lookup, and token-based announce protection.

[^libp2p]: libp2p, ["Kademlia DHT specification"](https://github.com/libp2p/specs/blob/master/kad-dht/README.md), especially the definitions of `k`, XOR distance, `alpha`, and the iterative peer-routing process. The IPFS specialization is documented at ["IPFS Kademlia DHT"](https://specs.ipfs.tech/routing/kad-dht/).

[^skademlia]: Ingmar Baumgart and Sebastian Mies, ["S/Kademlia: A Practicable Approach Towards Secure Key-Based Routing"](https://telematics.tm.kit.edu/publications/Files/267/SKademlia_2007.pdf), 2007.
