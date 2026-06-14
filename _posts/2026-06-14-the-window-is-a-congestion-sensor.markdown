---
layout: post
title: "Congestion Windows Listen to Queues"
description: "TCP congestion control is not just a throughput trick. The congestion window is a distributed control variable, and oversized queues can turn full bandwidth into bad latency."
date: 2026-06-14 15:30:00 -0400
categories: computer-science
tags: [tcp, congestion-control, aimd, bufferbloat, queues, networking, control-systems]
excerpt: "A full link is not automatically a healthy link. AIMD learns from loss, but when the loss signal arrives only after a huge buffer fills, the queue becomes invisible delay."
---

A network link does not tell each sender what rate it deserves.

It drops a packet. It delays an acknowledgment. Maybe it marks a packet with
ECN. Most of the time, the sender sees a few delayed, lossy shadows and has to
infer the state of a shared bottleneck it cannot directly inspect.

That is the quiet beauty of TCP congestion control. The sender keeps a variable
called the congestion window, `cwnd`, and uses it as a probe:

```text
increase while the path seems healthy
decrease when the path says "too much"
```

This is not a bandwidth knob in the ordinary sense. It is a sensor and an
actuator collapsed into one number.

RFC 5681 defines `cwnd` as a TCP sender-side state variable limiting how much
data can be sent before acknowledgments return. It also standardizes the classic
family of algorithms around slow start, congestion avoidance, fast retransmit,
and fast recovery.[^rfc5681] The famous sawtooth is not decoration. It is the
shape of a distributed system learning capacity through feedback.

The hard part is that feedback can arrive too late.

## The Old Disaster

Van Jacobson and Michael Karels wrote "Congestion Avoidance and Control" after
the early Internet had started to hurt itself.[^jacobson] Their paper opens with
a blunt observation: severe congestion had become common, and gateways could
drop a large fraction of incoming packets because of local buffer overflow. The
problem was not only bandwidth. It was control.

If senders inject packets faster than the bottleneck can drain them, queues
fill. If queues overflow, packets are dropped. If dropped packets cause
retransmissions that add still more load, the network can spend scarce capacity
carrying work that will not help anyone. That is congestion collapse in the
practical sense: the link is busy, but useful work falls.

The fix was not to assign a global traffic cop to every flow. The fix was to
make endpoints cautious enough to discover capacity without destroying it.

Two ideas matter here.

First, **slow start** is not actually slow in the everyday sense. It grows the
window quickly when the sender has little information, but it grows from a small
initial condition so the sender does not blast a new path with arbitrary load.

Second, **congestion avoidance** uses additive increase and multiplicative
decrease: grow roughly linearly while no congestion signal appears; cut the
window sharply when one does. Chiu and Jain's analysis of increase/decrease
algorithms studied this style of control abstractly and found that additive
increase with multiplicative decrease has the right convergence flavor for
efficiency and fairness under distributed feedback.[^chiu-jain]

The folklore version is:

```text
+1 packet per RTT
halve on loss
```

The actual TCP standards and implementations have many details. But that small
cartoon contains the core asymmetry: be patient while claiming more capacity,
be decisive when the path pushes back.

## Full Link, Sick Queue

The mistake is to equate high utilization with health.

A bottleneck queue is not bad by existing. Packet networks need buffers to
absorb short bursts. The bad state is a standing queue: a buffer that fills and
stays filled. The link reports 100 percent utilization, but every packet now
waits behind a pile of older packets. Throughput looks good. Interactive delay
does not.

That is the bufferbloat lesson. Nichols and Jacobson describe the problem
plainly in their CoDel article: unmanaged buffers have become more critical
because buffers are larger, delay-sensitive applications are common, and large
streaming downloads are normal.[^codel] Buffers are necessary, but persistently
full buffers convert excess capacity claims into delay.

The key timing issue is:

```text
tail drop tells the sender after the buffer is full
delay-based marking tries to speak before the buffer becomes a parking lot
```

That is not a moral statement about one queue algorithm winning forever. It is
about where the feedback lives. If the only signal is overflow, the queue may
have already accumulated hundreds of milliseconds of delay before the control
loop reacts.

## A Congestion Lab

The lab below is a deterministic toy, not a TCP stack. Each flow has a
congestion window measured in packets. Each round is one base RTT. A shared
bottleneck drains a fixed number of packets per round. If senders offer more
than the bottleneck can drain, the queue grows.

The three feedback modes are intentionally simple:

- **Tail drop:** signal congestion only when the buffer overflows; all flows cut
  together in this toy.
- **Delay mark:** signal selected flows when queue delay exceeds a target.
- **No signal:** windows keep increasing.

The toy is biased toward clarity. Real TCP observes ACK clocks, delayed ACKs,
SACK, retransmission timers, pacing, receiver windows, application stalls,
offload behavior, ECN, and many implementation details. The lab isolates the
control problem: what happens when the congestion signal arrives early, late, or
not at all?

<div class="congestion-lab" data-congestion-lab>
  <div class="congestion-lab__controls">
    <label>
      Feedback mode
      <select data-param="mode" aria-label="Feedback mode">
        <option value="tail" selected>Tail drop</option>
        <option value="aqm">Delay mark</option>
        <option value="none">No signal</option>
      </select>
    </label>
    <label>
      Flows <output data-value="flows">4</output>
      <input type="range" data-param="flows" min="1" max="8" step="1" value="4" aria-label="Flows">
    </label>
    <label>
      Bottleneck capacity <output data-value="capacity">90</output>
      <input type="range" data-param="capacity" min="30" max="180" step="5" value="90" aria-label="Bottleneck capacity">
    </label>
    <label>
      Buffer size <output data-value="buffer">360</output>
      <input type="range" data-param="buffer" min="30" max="900" step="30" value="360" aria-label="Buffer size">
    </label>
    <label>
      Base RTT <output data-value="baseRtt">60 ms</output>
      <input type="range" data-param="baseRtt" min="20" max="180" step="5" value="60" aria-label="Base RTT">
    </label>
    <label>
      Delay target <output data-value="targetDelay">25 ms</output>
      <input type="range" data-param="targetDelay" min="5" max="120" step="5" value="25" aria-label="Delay target">
    </label>
    <label>
      Multiplicative decrease <output data-value="beta">50%</output>
      <input type="range" data-param="beta" min="30" max="80" step="5" value="50" aria-label="Multiplicative decrease">
    </label>
    <label>
      Initial skew <output data-value="stagger">35%</output>
      <input type="range" data-param="stagger" min="0" max="100" step="5" value="35" aria-label="Initial skew">
    </label>
  </div>
  <div class="congestion-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Congestion control simulator showing congestion windows, queue delay, policy comparison, and flow fairness"></canvas>
  <div class="congestion-lab__legend">
    <span><i style="background:#2563eb"></i>Flow windows</span>
    <span><i style="background:#b45309"></i>Queue delay</span>
    <span><i style="background:#7c3aed"></i>Delay target</span>
    <span><i style="background:#be123c"></i>Tail drop</span>
    <span><i style="background:#0f766e"></i>Delay mark</span>
  </div>
  <p class="congestion-lab__note">
    Deterministic toy model, one round per base RTT. It is not packet-level TCP;
    it is a control-loop microscope for additive increase, multiplicative
    decrease, standing queues, and synchronized congestion signals.
  </p>
</div>

<script defer src="{{ '/assets/js/congestion-window-lab.js' | relative_url }}"></script>

Start with the default **Tail drop** setting. The utilization metric is
excellent. That is the trap. The p95 queue delay is huge because the buffer is
allowed to stand full before the sender hears a hard signal. The congestion
events are synchronized: all flows cut together, then climb together, then hit
the wall together.

Switch to **Delay mark**. The queue-delay panel should fall sharply. Utilization
usually remains high, though not always perfectly full in this stripped-down
model. The important difference is that the control loop receives information
before the buffer is exhausted. The queue stops being the only way to discover
overload.

Finally choose **No signal**. The link stays busy, but the sender side keeps
inventing work the bottleneck cannot use. That is the "busy is not healthy"
lesson in its simplest form.

## Why AIMD Has Teeth

The Chiu-Jain picture is useful because it separates two goals that are easy to
blend together.[^chiu-jain]

The first goal is **efficiency**: use the available bottleneck capacity. The
second is **fairness**: flows sharing the same bottleneck should converge toward
reasonable shares. Additive increase lets flows climb toward unused capacity
without one flow's current size becoming the main driver of its future claim.
Multiplicative decrease makes larger windows give back more absolute capacity
when congestion appears.

This is not charity. It is geometry. In a two-flow diagram, additive increase
moves the allocation roughly toward higher total load; multiplicative decrease
moves it back along a ray through the origin. Repeating that motion nudges the
system toward the fairness line while keeping the aggregate near capacity.

That is the elegant part.

The inelegant part is that the signal can be wrong, late, or synchronized. A
wireless loss may not mean congestion. A huge queue may hide congestion until
delay is already awful. Tail drop can make many flows halve together, creating a
sawtooth for the whole link instead of independent small corrections.

The control law is simple. The measurement channel is not.

## What The Queue Knows

Think of a bottleneck queue as state that endpoints can feel only indirectly.

If queue delay is small, the path has slack or at least is not persistently
backlogged. If queue delay grows, offered load is exceeding drain rate. If the
queue overflows, the path is screaming after it has already accumulated delay.

CoDel's design tries to control persistent queueing delay rather than raw queue
length.[^codel] That distinction matters because packet counts are not delay by
themselves. A queue of 100 packets means something different on a slow uplink
than on a fast data-center link. Delay is the user-visible symptom.

This is also why "just add buffer" is an attractive trap.

More buffer can reduce drops for short bursts. It can also delay the congestion
signal. A sender that waits for overflow will happily fill the new space. The
network does not become less congested. It becomes more patient before
admitting congestion.

That is a strange kind of politeness. It makes the dashboard look calmer and
the call feel worse.

## A Systems Checklist

For any congestion-like control loop, not only TCP, I would ask:

- What state variable limits offered work?
- What feedback tells the sender to increase or decrease?
- Is the feedback loss, delay, explicit marking, queue depth, or application
  latency?
- How delayed is the feedback relative to the action?
- Do many senders receive the same signal at once?
- Does the decrease rule give back capacity proportional to current demand?
- Is the queue absorbing bursts, or hiding persistent overload?
- Are we measuring useful throughput, offered work, loss, and delay separately?

That checklist applies to API rate limiters, worker pools, database admission
control, retry budgets, model-serving concurrency, and human review queues. A
shared resource rarely announces the correct rate. Clients infer it from pain.

The lesson from TCP is not "halve everything forever." The lesson is that a
good distributed control loop needs a state variable, a feedback signal, and
humility about delay.

The congestion window is how a sender asks the network a question.

The queue is how the network answers when we wait too long to listen.

[^jacobson]: Van Jacobson and Michael J. Karels, ["Congestion Avoidance and Control"](https://ee.lbl.gov/papers/congavoid.pdf), *ACM SIGCOMM*, 1988.

[^rfc5681]: Mark Allman, Vern Paxson, and Ethan Blanton, ["RFC 5681: TCP Congestion Control"](https://datatracker.ietf.org/doc/html/rfc5681), IETF, 2009.

[^chiu-jain]: Dah-Ming Chiu and Raj Jain, ["Analysis of the Increase and Decrease Algorithms for Congestion Avoidance in Computer Networks"](https://www.cse.wustl.edu/~jain/papers/ftp/cong_av.pdf), *Computer Networks and ISDN Systems* 17(1), 1989. DOI metadata: [10.1016/0169-7552(89)90019-6](https://doi.org/10.1016/0169-7552(89)90019-6).

[^codel]: Kathleen Nichols and Van Jacobson, ["Controlling Queue Delay"](https://queue.acm.org/detail.cfm?id=2209336), *ACM Queue*, 2012. See also the Communications of the ACM version: [10.1145/2209249.2209264](https://doi.org/10.1145/2209249.2209264).
