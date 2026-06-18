---
layout: post
title: "The Heartbeat Is a Suspicion Score"
description: "Phi-accrual failure detectors do not turn silence into an immediate yes/no verdict. They convert heartbeat delay into a tail probability, then let each protocol choose its own suspicion threshold."
date: 2026-06-18 07:12:00 -0400
categories: software-engineering
series: distributed-systems
tags: [distributed-systems, failure-detectors, phi-accrual, heartbeats, gossip, reliability]
excerpt: "A missed heartbeat is not proof of death. Phi-accrual detectors turn silence into a calibrated suspicion score, then make policy choose the threshold."
---

A heartbeat is not a proof of life.

It is a sample from a path that was recently alive enough to deliver a message.
When the samples stop, the observer has not learned "the process crashed." It
has learned a smaller fact:

```text
no heartbeat has arrived for t milliseconds
```

Everything else is policy.

That distinction matters because asynchronous distributed systems have no
local observation that cleanly separates a crashed process from a slow process.
Chandra and Toueg's failure-detector model was built around that discomfort:
the detector can be unreliable, and the protocol using it has to say what kind
of mistakes it can tolerate.[^chandra-toueg]

The fixed-timeout version hides the policy inside a single number:

```text
if silence exceeds 3 seconds, mark the peer down
```

That is often serviceable. It is also blunt. A three-second gap means something
different on a quiet LAN, a noisy mobile link, a JVM during a stop-the-world
pause, and a cloud VM under bursty scheduling delay. The same clock reading can
be ordinary in one history and alarming in another.

The phi-accrual failure detector changes the shape of the question:

```text
how surprising is this much silence, given the recent heartbeat history?
```

## Accrue Suspicion, Not Verdicts

Hayashibara, Defago, Yared, and Katayama introduced the phi-accrual detector as
an "accrual" detector: the monitoring component outputs a suspicion level
instead of a Boolean alive/dead answer.[^hayashibara] Applications then choose
their own thresholds. A cluster membership service, a speculative read path,
and a leader-election path do not need to attach the same cost to the same
silence.

The usual score is:

$$
\phi(t) = -\log_{10}(P_\text{later}(t)) = -\log_{10}(1 - F(t)),
$$

where $$F$$ is an estimated cumulative distribution function for heartbeat
inter-arrival times. In the original paper, the detector keeps a sliding window
of recent heartbeat intervals and models those intervals with a normal
distribution.[^hayashibara]

That logarithm is a useful engineering unit. If the model says a heartbeat
arriving this late or later has probability `0.001`, then:

$$
\phi = -\log_{10}(0.001) = 3.
$$

So increasing the threshold by one decimal order asks for roughly ten times
stronger evidence from silence. That is not magic calibration. It is calibration
relative to the detector's model, window, and workload.

Akka's documentation describes the same shape for its phi accrual failure
detector: compute phi from the normal CDF of historical heartbeat inter-arrival
times, return the phi value, and let the consumer interpret it.[^akka] It also
adds an operationally important knob, an acceptable heartbeat pause, because
production systems see garbage collection pauses, scheduling hiccups, and
network stalls that are not peer crashes.

## Lab: Score The Silence

The lab below simulates one observer monitoring one peer. The peer sends
heartbeats with a nominal period, random jitter, and occasional long pauses.
At `26 s` the peer crashes and no more heartbeats arrive.

Two policies listen to the same trace:

```text
fixed timeout: suspect when elapsed silence exceeds a fixed millisecond budget
phi accrual:   estimate the recent interval distribution and threshold phi
```

The implementation is intentionally small. It uses a deterministic random seed,
a bounded sliding window of inter-arrival samples, a normal approximation for
the heartbeat CDF, and a configurable pause margin:

```text
effective_elapsed = max(0, elapsed_since_last_heartbeat - pause_margin)
tail = 1 - normal_cdf(effective_elapsed, recent_mean, recent_stddev)
phi = -log10(tail)
```

That margin is not the essence of phi accrual. It is a production-flavored
acknowledgment that the monitor should not confuse every local scheduling pause
with remote death.

<style>
  .phi-lab {
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

  .phi-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .phi-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .phi-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .phi-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .phi-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .phi-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.68rem;
  }

  .phi-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .phi-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .phi-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .phi-lab__metric span,
  .phi-lab__legend,
  .phi-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }

  .phi-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.22rem;
    overflow-wrap: anywhere;
  }

  .phi-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 660px;
    max-width: 100%;
    width: 100%;
  }

  .phi-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .phi-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .phi-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .phi-lab__note {
    line-height: 1.45;
    margin: 0.75rem 0 0;
  }

  @media (max-width: 650px) {
    .phi-lab {
      padding: 0.85rem;
    }

    .phi-lab__controls {
      grid-template-columns: 1fr;
    }

    .phi-lab canvas {
      height: 930px;
    }
  }
</style>

<div id="phi-accrual-lab" class="phi-lab" data-phi-accrual-lab>
  <div class="phi-lab__controls">
    <label>
      Heartbeat <output data-value="heartbeat">1000 ms</output>
      <input data-param="heartbeat" type="range" min="500" max="2000" step="100" value="1000" aria-label="Nominal heartbeat interval">
    </label>
    <label>
      Jitter <output data-value="jitter">140 ms</output>
      <input data-param="jitter" type="range" min="20" max="500" step="10" value="140" aria-label="Heartbeat jitter">
    </label>
    <label>
      Pause chance <output data-value="pauseChance">10%</output>
      <input data-param="pauseChance" type="range" min="0" max="20" step="1" value="10" aria-label="Chance of a long heartbeat pause">
    </label>
    <label>
      Pause size <output data-value="pauseSize">1800 ms</output>
      <input data-param="pauseSize" type="range" min="0" max="3500" step="100" value="1800" aria-label="Long heartbeat pause size">
    </label>
    <label>
      Pause margin <output data-value="pauseMargin">250 ms</output>
      <input data-param="pauseMargin" type="range" min="0" max="1200" step="50" value="250" aria-label="Acceptable heartbeat pause margin">
    </label>
    <label>
      Phi threshold <output data-value="phiThreshold">4.0</output>
      <input data-param="phiThreshold" type="range" min="2" max="10" step="0.5" value="4" aria-label="Phi suspicion threshold">
    </label>
    <label>
      Fixed timeout <output data-value="fixedTimeout">1200 ms</output>
      <input data-param="fixedTimeout" type="range" min="800" max="6000" step="100" value="1200" aria-label="Fixed timeout threshold">
    </label>
    <label>
      Seed <output data-value="seed">92</output>
      <input data-param="seed" type="range" min="1" max="999" step="1" value="92" aria-label="Deterministic simulation seed">
    </label>
  </div>
  <div class="phi-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="660" aria-label="Phi accrual failure detector lab comparing a suspicion score against a fixed timeout on a heartbeat trace"></canvas>
  <div class="phi-lab__legend">
    <span><i style="background:#2563eb"></i>phi score and threshold</span>
    <span><i style="background:#b45309"></i>fixed timeout / long pauses</span>
    <span><i style="background:#0f766e"></i>ordinary heartbeat arrivals</span>
    <span><i style="background:#be123c"></i>crash and false-suspicion bands</span>
  </div>
  <p class="phi-lab__note">
    The lab is deterministic for a given seed. It is not a full membership
    protocol: there are no indirect probes, incarnation numbers, quorum rules,
    repair paths, or correlated multi-node failures.
  </p>
</div>

<script defer src="{{ '/assets/js/phi-accrual-lab.js?v=20260618b' | relative_url }}"></script>

The default run generates `26` heartbeat arrivals before the crash. The final
window estimates a mean inter-arrival time of about `962 ms` with a standard
deviation of about `157 ms`. With threshold `4.0` and a `250 ms` pause margin,
the phi detector crosses its threshold after roughly `1.80 s` of silence.

On that exact trace:

| Detector | False-suspicion episodes before crash | First suspicion after crash |
| --- | ---: | ---: |
| Phi threshold 4.0 | 0 | 900 ms |
| Fixed 1200 ms timeout | 1 | 300 ms |

The fixed timeout is faster here because it is deliberately aggressive: it
fires only `200 ms` above the nominal heartbeat interval. It also pays for that
aggression before the crash. The phi detector is not "better" in the abstract.
It is making the tradeoff explicit:

```text
lower threshold -> faster detection, more false suspicion
higher threshold -> slower detection, fewer false suspicion events
```

You can reproduce the audit from Node:

```js
const lab = require("./assets/js/phi-accrual-lab.js");

const audit = lab.auditPhiAccrualLab();
const failed = audit.cases.filter((row) => !row.passed);
if (failed.length) throw new Error(JSON.stringify(failed));
if (audit.passed !== audit.total) {
  throw new Error(`only ${audit.passed}/${audit.total} cases passed`);
}

console.table(audit.cases.map((row) => ({
  scenario: row.label,
  heartbeat: row.heartbeat,
  phiThreshold: row.phiThreshold,
  phiDetectMs: row.phiDetectionMs,
  fixedDetectMs: row.fixedDetectionMs,
  phiFalse: row.phiFalse,
  fixedFalse: row.fixedFalse,
  mean: row.mean.toFixed(1),
  std: row.std.toFixed(1)
})));
```

The grid keeps the audit small but varied: a default noisy path, a quiet path, a
bursty path, and a very noisy path. Each case asserts monotone heartbeat
arrival times, bounded sample windows, finite phi scores, eventual detection,
and monotone detection delay as the phi threshold rises.

## What The Number Does Not Know

The score looks probabilistic, but the detector is not a truth oracle. It is a
small statistical instrument.

First, the distributional assumption is fragile. A normal model over recent
inter-arrival times is convenient, not sacred. Real delay often has heavy tails,
diurnal structure, congestion episodes, garbage collection pauses, and
correlated failures. If the tail model is wrong, `phi = 4` does not mean "one
mistake in ten thousand" in the world. It means "tail probability around
`10^-4` under this detector's current model."

Second, the sliding window learns from recent pain. That is usually a feature:
when a path becomes noisy, the detector becomes less eager to convict. It can
also be a trap. If the window is filled with pathological delay, a real crash
can take longer to detect because the detector has learned to expect silence.

Third, suspicion is not membership. Cassandra's older 2.2 documentation
described a phi-style `phi_convict_threshold` inside gossip failure detection,
with lower thresholds marking nodes down more readily and higher thresholds
reducing transient false failures.[^cassandra] That detector output still has
to feed a repair story: hinted handoff, read repair, anti-entropy repair, or a
human decision. Marking a node down is not the same thing as making the data
safe.

Finally, a detector threshold is a product decision wearing math clothes. A
load balancer may prefer quick removal and accept some false positives. A
consensus system may require a separate election timeout, quorum evidence, and
term fencing. A paging system may prefer to wait, aggregate evidence, or
require independent observers before waking a human.

## The Useful Separation

The best part of phi accrual is not the normal CDF. It is the separation of
measurement from interpretation:

```text
monitor: here is how surprising the silence is
policy: here is what this subsystem does at that suspicion level
```

That separation is modest and powerful. It lets one observer feed different
consumers without pretending they share the same loss function. It also forces
the operational question into daylight:

```text
what is the cost of waiting?
what is the cost of being wrong?
what delay history should count as normal?
what repair path handles an incorrect suspicion?
```

A missed heartbeat is evidence. A phi score is a calibrated way to write down
that evidence. The failure detector still does not know whether the peer is
dead. It only tells the protocol how expensive the silence has become.

The simulator source is in
[`assets/js/phi-accrual-lab.js`]({{ '/assets/js/phi-accrual-lab.js' | relative_url }}).

[^chandra-toueg]: Tushar Deepak Chandra and Sam Toueg, ["Unreliable Failure Detectors for Reliable Distributed Systems"](https://www.cs.utexas.edu/~lorenzo/corsi/cs380d/papers/p225-chandra.pdf), *Journal of the ACM* 43(2):225-267, 1996.

[^hayashibara]: Naohiro Hayashibara, Xavier Defago, Rami Yared, and Takuya Katayama, ["The Phi Accrual Failure Detector"](https://dspace.jaist.ac.jp/dspace/bitstream/10119/4784/1/IS-RR-2004-010.pdf), JAIST Technical Report IS-RR-2004-010, 2004.

[^akka]: Akka documentation, ["The Phi Accrual Failure Detector"](https://doc.akka.io/libraries/akka-core/current/typed/failure-detector.html).

[^cassandra]: DataStax documentation for Apache Cassandra 2.2, ["Failure detection and recovery"](https://docs.datastax.com/en/cassandra-oss/2.2/cassandra/architecture/archDataDistributeFailDetect.html).
