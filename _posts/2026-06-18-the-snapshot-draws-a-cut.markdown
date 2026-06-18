---
layout: post
title: "The Snapshot Draws a Cut"
description: "Chandy-Lamport snapshots record a meaningful global state without stopping a distributed system. The trick is to record both local process state and the messages caught between first marker and marker arrival."
date: 2026-06-18 07:00:00 -0400
categories: computer-science
series: distributed-systems
tags: [distributed-systems, chandy-lamport, distributed-snapshots, consistent-cuts, message-passing, fault-tolerance]
excerpt: "A distributed snapshot is not a simultaneous photograph. It is a cut through the happens-before graph, and marker messages make the channel state do the accounting."
---

A distributed snapshot is not a pause button.

That is the useful part. If the only way to inspect a distributed system were to
stop every process at the same physical instant, many of the systems we care
about would be uninspectable in exactly the moments we most need evidence.
There is no single clock worth trusting. Messages are in flight. One machine can
be between "sent" and "delivered" while another has already moved on.

The question Chandy and Lamport asked in 1985 was sharper than "can we take a
picture?" It was:

```text
can processes record local states and channel states
so the assembled picture is a possible global state?
```

The answer is yes, under a precise model: finite processes, directed channels
that are reliable and FIFO, no shared memory, no shared clock, and arbitrary but
finite message delay.[^chandy] The algorithm does not halt the underlying
computation. It adds marker messages.

That sounds too small to work. It works because the snapshot is not trying to
find an actual simultaneous instant. It is trying to draw a consistent cut
through a partial order.

## What A Cut Is

Lamport's happened-before relation gives the evidence rule for message-passing
systems: local order on a process matters, a send happens before the matching
receive, and the relation is transitive.[^lamport] A global snapshot chooses a
prefix of events from each process. Draw a vertical line through each process's
timeline. The union of the events to the left of those lines is a cut.

A cut is consistent when it never contains a receive without also containing
the corresponding send:

$$
\operatorname{recv}(m) \in C \implies \operatorname{send}(m) \in C.
$$

That rule is the whole moral center. If a snapshot says process `q` has already
received a token but process `p` has not yet sent it, the picture is not a
possible global state. It is an artifact of observation.

The other direction is allowed. A cut may contain the send but not the receive.
That means the message is in the channel state:

```text
sent before sender's recorded state
not received before receiver's recorded state
therefore recorded as in transit
```

So a global state is not just the set of process-local states. It is:

```text
local state of every process
+ contents of every channel crossing the cut
```

This is the part casual explanations often rush past. The channels are not
implementation detail. They are where conservation laws go when processes are
photographed at different logical times.

## The Marker Rule

In the Chandy-Lamport algorithm, any process can start a snapshot. When it
starts, it records its local state and sends a marker on each outgoing channel
before sending more application messages on those channels.

Then each receiver applies two rules:

```text
on first marker:
  record local state
  record the marker's incoming channel as empty
  send markers on all outgoing channels
  record application messages arriving on other incoming channels

on later marker for channel c:
  stop recording channel c
```

The phrase "marker's incoming channel as empty" is doing real work. Because the
channel is FIFO, any application message sent on that channel before the marker
would have arrived before the marker. If the receiver sees the marker first,
there is no older message hiding behind it on that channel.

For the other incoming channels, the receiver has recorded itself but has not
yet seen the boundary marker from those senders. Any application message that
arrives in that interval belongs to the channel state. It was sent before that
sender's cut and received after this receiver's cut.

The marker is not a lock. It is a receipt that says:

```text
everything before me on this FIFO channel belongs before the sender's cut
everything after me belongs after it
```

## Lab: Catch The In-Transit Message

The lab below simulates three processes that transfer conserved tokens. A
process that sends a token subtracts it immediately; the receiver adds it when
the application message arrives. The snapshot should preserve the total number
of tokens by adding recorded local balances and recorded channel messages.

Turn **FIFO channels** off after looking at the default run. The marker may
overtake an older application message on the same channel. The audit then fails
for the right reason: the original algorithm's channel assumption has been
removed.

<style>
  .snapshot-lab {
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

  .snapshot-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .snapshot-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .snapshot-lab__controls input[type="range"] {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .snapshot-lab__toggle {
    align-items: center;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    display: flex !important;
    gap: 0.55rem !important;
    justify-content: space-between;
    min-height: 3.6rem;
    padding: 0.58rem 0.68rem;
  }

  .snapshot-lab__toggle input {
    accent-color: #0f766e;
    height: 1.05rem;
    width: 1.05rem;
  }

  .snapshot-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .snapshot-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .snapshot-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.68rem;
  }

  .snapshot-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .snapshot-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .snapshot-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .snapshot-lab__metric span,
  .snapshot-lab__legend,
  .snapshot-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }

  .snapshot-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .snapshot-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 640px;
    max-width: 100%;
    width: 100%;
  }

  .snapshot-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .snapshot-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .snapshot-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .snapshot-lab__note {
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 640px) {
    .snapshot-lab {
      padding: 0.85rem;
    }

    .snapshot-lab__controls {
      grid-template-columns: 1fr;
    }

    .snapshot-lab canvas {
      height: 900px;
    }
  }
</style>

<div class="snapshot-lab" data-chandy-lamport-lab>
  <div class="snapshot-lab__controls">
    <label>
      Starter <output data-value="starter">P0</output>
      <input data-param="starter" type="range" min="0" max="2" step="1" value="0">
    </label>
    <label>
      Snapshot time <output data-value="snapshotAt">t=8</output>
      <input data-param="snapshotAt" type="range" min="4" max="16" step="1" value="8">
    </label>
    <label>
      App delay <output data-value="appDelay">5</output>
      <input data-param="appDelay" type="range" min="2" max="9" step="1" value="5">
    </label>
    <label>
      Marker delay <output data-value="markerDelay">2</output>
      <input data-param="markerDelay" type="range" min="1" max="8" step="1" value="2">
    </label>
    <label>
      Traffic <output data-value="traffic">8</output>
      <input data-param="traffic" type="range" min="4" max="12" step="1" value="8">
    </label>
    <label>
      Seed <output data-value="seed">37</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="37">
    </label>
    <label class="snapshot-lab__toggle">
      <span>FIFO channels <output data-value="fifo">on</output></span>
      <input data-param="fifo" type="checkbox" checked>
    </label>
  </div>
  <div class="snapshot-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="Chandy-Lamport distributed snapshot lab with process timelines, marker messages, channel state, and cut audit"></canvas>
  <div class="snapshot-lab__legend">
    <span><i style="background:#0f766e"></i> Application message</span>
    <span><i style="background:#7c3aed"></i> Marker message</span>
    <span><i style="background:#2563eb"></i> Local record</span>
    <span><i style="background:#b45309"></i> Recorded channel message</span>
  </div>
  <p class="snapshot-lab__note">
    Deterministic simulation. The audit checks token conservation, receive
    closure, and whether every sent-before/received-after message appears in
    channel state.
  </p>
</div>

<script defer src="{{ '/assets/js/chandy-lamport-lab.js?v=20260618b' | relative_url }}"></script>

At the default setting, the snapshot starts at `P0` around time `8`. The lab's
processes begin with token balances `[18, 14, 12]`, so the conserved total is
`44`. The recorded local balances alone usually do not add to `44`. That is not
a failure. The missing mass is sitting in recorded channel state.

The audit asks three questions:

```text
1. Did the snapshot complete?
2. Does every recorded receive have its send recorded?
3. Is every sent-before / received-after application message in channel state?
```

With FIFO channels on, those checks pass. With FIFO channels off, the marker can
arrive before an older application message on the same channel. Then the
receiver closes that channel too early. The later application message was sent
before the sender's cut but is no longer recorded as channel state. The total
can go missing.

You can reproduce the audit from Node:

```js
const lab = require("./assets/js/chandy-lamport-lab.js");

const audit = lab.auditChandyLamportLab();
const failed = audit.cases.filter((row) => !row.passed);
if (failed.length) throw new Error(JSON.stringify(failed));

console.table(audit.cases.map((row) => ({
  scenario: row.label,
  expected: row.expectedPass ? "pass" : "fail",
  snapshotTotal: row.snapshotTotal,
  channelAmount: row.channelAmount,
  missingChannel: row.missingChannel,
  markerOvertakes: row.markerOvertakes,
  passed: row.passed
})));
```

The current deterministic grid has three FIFO cases that preserve the token
ledger and one non-FIFO case that is supposed to fail. On the default failing
case, the marker overtakes ten older application messages and the snapshot total
drops from `44` to `25`.

The source is intentionally small:
[`assets/js/chandy-lamport-lab.js`]({{ '/assets/js/chandy-lamport-lab.js' | relative_url }}).

## The Conservation Proof Sketch

For a channel \(c = p \rightarrow q\), let:

```text
n  = messages sent on c before p records
m  = messages received on c before q records
```

A consistent channel state should contain exactly the messages numbered
\(m+1, \ldots, n\). If \(n=m\), the channel is empty at the cut. If \(n>m\),
the difference is precisely the in-transit suffix. If \(m>n\), the receiver's
snapshot contains a message whose send is outside the sender's snapshot, which
is impossible for a consistent cut.

The marker makes the receiver learn where \(n\) is without asking the sender's
clock. Sender `p` records, sends the marker on `c`, and sends no further
application messages on `c` before that marker. Since `c` is FIFO, receiver `q`
will receive all pre-marker application messages before the marker.

There are two cases.

If `q` receives the marker before recording its own local state, it records
itself immediately and records channel `c` as empty. All application messages
from `p` that preceded the marker have already been received, so there is no
sent-before/received-after suffix on `c`.

If `q` already recorded its local state, it has been logging application
messages arriving on `c`. When the marker arrives, those logged messages are
exactly the ones sent before `p` recorded and received after `q` recorded. That
is the channel state.

Do that independently for every directed channel, and the assembled state obeys
the receive-closure rule. Chandy and Lamport's proof phrases the result slightly
differently: even if the recorded state did not occur as a literal state in the
original run, there is a permutation of independent events in which it does
occur between initiation and termination.[^chandy] That is the right notion of
"meaningful" in a partial order.

## Stable Properties Are The Use Case

The original paper motivates snapshots with stable-property detection. A stable
property is one that remains true once it becomes true: termination of a phase,
deadlock under a fixed wait relation, or loss of all tokens in a token ring are
examples in the paper's model.[^chandy] If a stable property is true in the
recorded global state, then it was not created by the observer's bad timing.

This does not mean arbitrary predicates are easy. Global predicate detection is
subtle because many predicates are not stable, and because different consistent
cuts can disagree about transient conditions. Mattern's later work on virtual
time and global states is useful background here: distributed time is better
understood as a partial order, often a lattice of possible cuts, rather than a
single line that every observer can agree on.[^mattern]

The snapshot algorithm gives you one well-formed point in that structure. It
does not give you omniscience.

## What The Algorithm Does Not Promise

It does not promise a wall-clock instant. The recorded state can be a state that
is reachable by reordering concurrent events, not a frame that physically
appeared on every machine at once.

It does not make non-FIFO channels FIFO. If the transport can reorder messages,
the marker needs extra sequencing machinery or a different snapshot algorithm.
The lab's failing toggle is deliberately unfair to the original algorithm: it
removes an assumption the proof uses.

It does not collect the snapshot for free. The marker rules tell processes what
to record. A real system still needs to gather the recorded local and channel
states, handle membership, bound buffers, decide how to name concurrent
snapshots, and integrate the result with checkpointing or monitoring.

It also does not turn an unstable predicate into a stable one. If you ask
"is queue length currently above 100?" a consistent cut avoids impossible
observations, but the answer may change immediately. The stable-property
framing matters because it tells you when a positive observation can safely be
treated as durable.

## The Debugging Shape

What I like about the algorithm is that it is honest about observation. It does
not pretend that physical simultaneity is available. It does not compress a
partial order into a scalar timestamp and then forget what was lost. It records
the pieces that make the cut meaningful:

```text
process prefixes
message edges crossing the boundary
FIFO markers that delimit those edges
```

That is a good debugging habit outside distributed-systems theory too. When a
measurement spans multiple actors, ask what boundary it actually drew. Ask what
state crossed that boundary. Ask which assumptions make the boundary
well-defined.

The marker is tiny. The accounting it permits is not.

[^chandy]: K. Mani Chandy and Leslie Lamport, ["Distributed Snapshots: Determining Global States of Distributed Systems"](https://lamport.azurewebsites.net/pubs/chandy.pdf), *ACM Transactions on Computer Systems*, 3(1), February 1985. The paper states the FIFO channel model, gives the marker sending and receiving rules, and proves the recorded global state is meaningful in the computation's partial order.

[^lamport]: Leslie Lamport, ["Time, Clocks, and the Ordering of Events in a Distributed System"](https://lamport.azurewebsites.net/pubs/time-clocks.pdf), *Communications of the ACM*, 21(7), July 1978.

[^mattern]: Friedemann Mattern, ["Virtual Time and Global States of Distributed Systems"](https://vs.inf.ethz.ch/publ/bibtex.html?file=papers%2FVirtTimeGlobStates), in *Proc. Workshop on Parallel and Distributed Algorithms*, 1989.
