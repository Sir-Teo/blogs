---
layout: post
title: "The Watermark Is a Promise About the Past"
description: "Event-time stream processing is a negotiation between correctness and latency. A watermark is the system's current promise about which old events are probably no longer coming."
date: 2026-06-17 03:10:00 -0400
categories: software-engineering
tags: [stream-processing, event-time, watermarks, distributed-systems, apache-beam, apache-flink, data-systems]
excerpt: "A dashboard wants to know whether noon is done. A watermark answers with a promise, not a clock."
---

At 12:04, someone checks out.

At 12:07, the store tablet loses network.

At 12:31, the event arrives.

Your dashboard has already answered the question:

```text
how many checkouts happened between 12:00 and 12:10?
```

Was the dashboard wrong?

Not exactly. It made a promise too early.

Stream processing is full of these little contracts with time. The record has
one clock, the machine has another, and the business question often has a third.
The hard part is not counting. Counting is easy. The hard part is deciding when
the count is allowed to look finished.

That decision is the job of a watermark.

## The Stream Has Two Clocks

There is **event time**:

```text
when the thing happened
```

and **processing time**:

```text
when the system saw it
```

Apache Beam's guide puts the same distinction in operational terms: event time
comes from the timestamp attached to the element, while processing time comes
from the clock of the system processing that element.[^beam-watermarks]

If events always arrived in event-time order, a streaming window would be a
minor convenience. Close the 12:00-12:10 bucket when the next event says 12:10.
Move on.

But ordinary systems do not give us that world:

```text
phone offline
Kafka partition paused
batch backfill replayed
gateway retry delayed
market data feed recovered
client clock skewed
```

So a windowing system needs a progress signal in event time. Flink describes
watermarks as timestamped markers flowing through the stream; a watermark at
time `t` declares that event time has reached `t`, so records at or before `t`
should no longer appear on that input.[^flink-time]

That word "should" is doing a lot of work.

## A Watermark Is Not a Wall Clock

In the lab below, the watermark is intentionally simple:

```text
watermark = max event time seen so far - delay
```

If the largest event timestamp we have seen is minute 84, and the delay knob is
12 minutes, the watermark says:

```text
I am willing to act as if events up through minute 72 are complete.
```

This is not a theorem about the outside world. It is a policy.

If delayed minute-65 data arrives after that, the pipeline has to decide whether
to revise the old answer, drop the record, or route it somewhere else. Beam
names the knobs directly: triggers decide when window panes are emitted, and
allowed lateness controls how long late data can still affect a window after the
watermark passes the end of that window.[^beam-triggers]

The Dataflow model paper makes the decomposition beautifully explicit:

```text
what:       the computation
where:      event-time windows
when:       triggers in processing time
how:        accumulation, discarding, or retractions
```

Windowing groups data by event time. Triggering decides when panes of those
groups are emitted.[^dataflow-model]

That separation is the small piece of design that makes unbounded, out-of-order
data bearable.

## The Lab

This lab generates an event stream, delays some records, then runs a tumbling
window aggregator with:

```text
fixed-delay watermark
allowed lateness
accumulating late panes
final batch audit
```

The defaults are deliberately uncomfortable. They model mobile events with
offline bursts. The dashboard gets useful early answers, but some old records
arrive after the allowed-lateness horizon and are dropped.

<style>
  .watermark-stream-lab {
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

  .watermark-stream-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .watermark-stream-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .watermark-stream-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .watermark-stream-lab select,
  .watermark-stream-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .watermark-stream-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .watermark-stream-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 1rem;
  }

  .watermark-stream-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.68rem 0.72rem;
  }

  .watermark-stream-lab__metric span {
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

  .watermark-stream-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.88rem, 2.4vw, 1.06rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .watermark-stream-lab__metric.good strong {
    color: #0f766e;
  }

  .watermark-stream-lab__metric.warn strong {
    color: #d97706;
  }

  .watermark-stream-lab__metric.bad strong {
    color: #be123c;
  }

  .watermark-stream-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .watermark-stream-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .watermark-stream-lab {
      padding: 0.75rem;
    }

    .watermark-stream-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="event-time-watermark-lab" class="watermark-stream-lab" data-event-time-watermark-lab>
  <div class="watermark-stream-lab__controls">
    <label>
      Stream
      <select data-param="scenario" aria-label="Event stream scenario">
        <option value="mobile" selected>mobile offline</option>
        <option value="checkout">checkout bursts</option>
        <option value="market">market feed</option>
      </select>
      <span data-value="scenario">mobile offline</span>
    </label>
    <label>
      Events
      <input type="range" min="80" max="360" step="10" value="190" data-param="events" aria-label="Number of generated events">
      <span><output data-value="events">190</output> records</span>
    </label>
    <label>
      Disorder tail
      <input type="range" min="0" max="100" step="1" value="58" data-param="disorder" aria-label="Out-of-order tail pressure">
      <span data-value="disorder">58%</span>
    </label>
    <label>
      Watermark delay
      <input type="range" min="0" max="90" step="1" value="12" data-param="watermarkDelay" aria-label="Fixed watermark delay in minutes">
      <span data-value="watermarkDelay">12 min</span>
    </label>
    <label>
      Allowed lateness
      <input type="range" min="0" max="60" step="1" value="8" data-param="allowedLateness" aria-label="Allowed lateness in minutes">
      <span data-value="allowedLateness">8 min</span>
    </label>
    <label>
      Window size
      <input type="range" min="5" max="30" step="5" value="10" data-param="windowSize" aria-label="Tumbling window size in minutes">
      <span data-value="windowSize">10 min</span>
    </label>
    <label>
      Seed
      <input type="range" min="1" max="9999" step="1" value="23" data-param="seed" aria-label="Random seed">
      <span data-value="seed">23</span>
    </label>
  </div>
  <div class="watermark-stream-lab__metrics" data-metrics></div>
  <canvas data-canvas width="960" height="760" aria-label="Event-time watermark simulator showing event-time versus processing-time scatter, window ledger, latency-error frontier, and late-data ledger"></canvas>
  <p class="watermark-stream-lab__note">
    Simplified single-input model. Real engines compute and propagate
    watermarks with source-specific logic, partition minima, holds, timers, and
    runner-specific machinery. The audit here compares the stream result with
    the exact batch count for the generated records.
  </p>
</div>

<script defer src="{{ '/assets/js/event-time-watermark-lab.js?v=20260617c' | relative_url }}"></script>

With the default seed, the lab generates `190` mobile events. A 12-minute
watermark delay and 8 minutes of allowed lateness produce an early answer for
most windows, but the final audit still loses `53` records. The on-time panes
contain about `70%` of the eventual batch truth.

Move the watermark delay to the right. The red error usually falls, but the
pane latency rises. Move allowed lateness to the right. More late records can
revise old windows, but the system retains state longer.

This is the whole trade:

```text
fast enough to be useful
late enough to be honest
cheap enough to keep running
```

## What the Watermark Buys

For a tumbling window `[a, a + h)`, the lab follows these rules:

```text
first pane:     emit when watermark >= a + h
late pane:      revise if a record arrives before a + h + allowed_lateness
garbage collect: forget state when watermark >= a + h + allowed_lateness
drop:           reject records after that point
```

The first pane is not the final truth. It is the first answer the system is
willing to publish under the current completeness estimate.

The late pane is a confession:

```text
the past changed because the input arrived late
```

The garbage-collection point is a budget line. Once the system forgets the
window, an old record is no longer a correction. It is an exception.

The 2021 PVLDB paper on watermarks frames this as reasoning about temporal
completeness in infinite streams. It also separates the implementation into
generation, propagation, and consumption: how watermarks are made, how they
move through the graph, and how operators react to them.[^watermarks-pvldb]

That decomposition prevents a lot of mystical thinking. A watermark is not a
magic clock. It is data-system plumbing with failure modes.

## The Wrong Watermark Has a Shape

Too aggressive:

```text
low latency
more late panes
more dropped data
state can be freed sooner
```

Too conservative:

```text
better completeness
slower answers
more state retained
operators wait on old possibilities
```

This is why the lab includes a frontier instead of only a scatter plot. A single
setting can look reasonable until you sweep the delay and see the neighboring
choices. The current point is not "correct" in isolation. It is one point on a
latency/error curve.

The PVLDB paper is blunt about heuristic watermarks: if the watermark is not
derived from a real completeness guarantee, downstream code must handle late
data, and the next best thing to exactness is knowing how inaccurate the result
is.[^watermarks-late]

That is a useful engineering principle:

```text
instrument the amount of past you are throwing away
```

## Absence Is the Hard Case

Counting late events is already annoying.

Reasoning about absence is worse.

Suppose the product asks:

```text
alert when no heartbeat arrives for a device for 5 minutes
```

A positive event can arrive late and correct a count. A missing event is not an
object. The only way to act on absence is to trust some progress signal. If the
watermark says minute 72 is complete, and no heartbeat exists by minute 72, the
system may fire an alert.

If the watermark is too fast, the alert is false.

If the watermark is too slow, the alert is stale.

This is why watermarks matter beyond dashboards. They are how stream processors
make negative facts operational.

MillWheel, an earlier Google stream-processing system, emphasized logical time
as part of its programming model for time-based aggregations.[^millwheel] The
later Dataflow/Beam vocabulary made the time contract more explicit: event-time
windows, processing-time triggers, and panes that can accumulate or revise.

Once you see it, you start noticing the same problem everywhere:

```text
is the auction over?
is the user inactive?
is the risk window closed?
is the backfill complete?
is the anomaly model allowed to score this interval?
```

All of these questions ask a system to make a claim about the past before the
universe has politely stopped sending data.

## Real Systems Are More Careful Than the Lab

The fixed-delay formula in the lab is intentionally naive. It is a clean way to
see the curve, not a recommendation.

Real systems have to deal with:

```text
multiple input partitions
idle sources
source-specific timestamp guarantees
stateful operators that hold watermarks back
joins whose output time depends on both sides
backfills that intentionally replay old data
fault tolerance and checkpoint recovery
```

Flink's documentation notes that operators with multiple inputs take progress
from their input watermarks, commonly constrained by the slowest input.[^flink-time]
The PVLDB comparison goes deeper: Flink propagates watermarks in-band as stream
metadata, while Cloud Dataflow computes and propagates them out of band through
an external aggregator.[^watermarks-implementations]

Those are different architectures for the same semantic pressure:

```text
when may this operator stop waiting for old event times?
```

The practical lesson is not "set the delay to 12 minutes."

The practical lesson is to expose the contract:

```text
watermark lag
late records accepted
late records dropped
pane correction rate
state retained because of allowed lateness
batch reconciliation error
```

If those numbers are invisible, the dashboard can look calm while quietly
discarding the past.

## Reproducibility Notes

The executable artifact is
[`assets/js/event-time-watermark-lab.js`]({{ '/assets/js/event-time-watermark-lab.js' | relative_url }}).

The Node audit checks:

```text
generated events partition exactly into windows
accepted + dropped = processed
final batch count error = dropped records
watermarks are monotone
on-time panes fire only after watermark >= window end
late panes fire only before garbage collection
event statuses agree with the pre-arrival watermark
per-window exact = accepted + dropped
nonempty windows fire and finalize by the final flush
a sufficiently slow watermark drops no data
dropped records do not increase as watermark delay grows
```

That last assertion is the point of the experiment. More waiting is not free,
but it should not make this simple single-input policy less complete.

The current audit runs 38,076 checks across all three scenarios, three seeds,
three disorder levels, two window sizes, and three allowed-lateness settings.
It also pins the default story in the text: `190` generated records, `53`
dropped late records, and a first-pane completeness of about `70%`.

In production, I would want the same shape of audit next to every important
stream:

```text
what did we publish first?
what changed later?
what did we drop?
what would the batch replay have said?
```

A watermark is a promise about the past.

Good systems remember which promises were broken.

[^beam-watermarks]: Apache Beam, ["Programming Guide: Watermarks and late data"](https://beam.apache.org/documentation/programming-guide/#watermarks-and-late-data).

[^beam-triggers]: Apache Beam, ["Programming Guide: Triggers"](https://beam.apache.org/documentation/programming-guide/#triggers), including `AfterWatermark`, early firings, late firings, accumulation modes, and allowed lateness.

[^flink-time]: Apache Flink, ["Timely Stream Processing"](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/), especially the sections on event time, watermarks, parallel streams, and lateness.

[^dataflow-model]: Tyler Akidau, Robert Bradshaw, Craig Chambers, Slava Chernyak, Rafael J. Fernandez-Moctezuma, Reuven Lax, Sam McVeety, Daniel Mills, Frances Perry, Eric Schmidt, and Sam Whittle, ["The Dataflow Model: A Practical Approach to Balancing Correctness, Latency, and Cost in Massive-Scale, Unbounded, Out-of-Order Data Processing"](https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf), PVLDB 2015.

[^watermarks-pvldb]: Tyler Akidau, Edmon Begoli, Slava Chernyak, Fabian Hueske, Kathryn Knight, Kenneth Knowles, Daniel Mills, and Dan Sotolongo, ["Watermarks in Stream Processing Systems: Semantics and Comparative Analysis of Apache Flink and Google Cloud Dataflow"](https://vldb.org/pvldb/vol14/p3135-begoli.pdf), PVLDB 2021.

[^watermarks-late]: Akidau et al., "Watermarks in Stream Processing Systems," Section 4.5, on non-conformant watermarks, late data, recomputation, and monitoring dropped late data.

[^millwheel]: Tyler Akidau, Alex Balikov, Kaya Bekiroglu, Slava Chernyak, Josh Haberman, Reuven Lax, Sam McVeety, Daniel Mills, Paul Nordstrom, and Sam Whittle, ["MillWheel: Fault-Tolerant Stream Processing at Internet Scale"](https://research.google.com/pubs/archive/41378.pdf), PVLDB 2013. Google Research also hosts a publication page with the abstract and venue information: [MillWheel](https://research.google/pubs/millwheel-fault-tolerant-stream-processing-at-internet-scale/).

[^watermarks-implementations]: Akidau et al., "Watermarks in Stream Processing Systems," Section 5, comparing Flink's in-band watermark propagation with Cloud Dataflow's out-of-band aggregation approach.
