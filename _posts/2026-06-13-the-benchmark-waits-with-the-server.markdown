---
layout: post
title: "The Benchmark Waited Through the Outage"
description: "Closed-loop latency tests can stop sending work exactly when the service is slow. Coordinated omission turns a tail-latency incident into a tidy percentile report."
date: 2026-06-13 18:27:00 -0400
categories: computer-science
tags: [latency, coordinated-omission, queueing, performance-testing, distributed-systems, benchmarking]
excerpt: "A benchmark is a traffic model, not just a stopwatch. If the load generator waits with the overloaded service, the worst seconds can disappear from the measurement."
---

A latency benchmark looks objective because it prints numbers.

```text
p50  8 ms
p95  19 ms
p99  28 ms
```

Numbers are reassuring. Percentiles are especially reassuring because they have
the texture of operational maturity. They sound like the engineer has looked
past the average and into the tail.

But a percentile is only a statistic of the samples you collected. If the load
generator stops sampling when the system is slow, the tail can politely vanish.

That failure mode has a wonderfully incriminating name: coordinated omission.
The benchmark coordinates with the system under test. The service stalls, the
client waits, and while the client is waiting it sends no new requests. The
requests that would have arrived, waited, timed out, or experienced the stall as
users are omitted from the histogram.

The benchmark is not lying maliciously. It is worse: it is telling the truth
about the wrong experiment.

## The Load Generator Has a Job

There are two very different traffic contracts.

An open-loop load generator says:

```text
send a request every 10 ms, whether previous requests finished or not
```

A closed-loop load generator says:

```text
send a request
wait for the response
maybe sleep
send the next request
```

Closed-loop traffic can be the right model for some users. A single human often
cannot click again before the page returns. But it is not the right model for an
arrival process where many independent users, clients, jobs, devices, agents, or
upstream services keep arriving while the backend is sick.

The difference is not philosophical. It changes the latency distribution.

<div id="coordinated-omission-lab" class="co-lab" data-coordinated-omission-lab>
  <div class="co-lab__controls">
    <label>
      Offered load: <output data-value="load">88.0%</output>
      <input type="range" min="35" max="98" step="1" value="88" data-param="load">
    </label>
    <label>
      Mean service: <output data-value="meanService">8.00 ms</output>
      <input type="range" min="2" max="30" step="1" value="8" data-param="meanService">
    </label>
    <label>
      Service CV: <output data-value="serviceCv">65.0%</output>
      <input type="range" min="0" max="200" step="5" value="65" data-param="serviceCv">
    </label>
    <label>
      Pause every: <output data-value="pauseEvery">4.50 s</output>
      <input type="range" min="1.5" max="10" step="0.5" value="4.5" data-param="pauseEvery">
    </label>
    <label>
      Pause duration: <output data-value="pauseDuration">180 ms</output>
      <input type="range" min="0" max="420" step="20" value="180" data-param="pauseDuration">
    </label>
    <label>
      Run length: <output data-value="duration">22.0 s</output>
      <input type="range" min="8" max="40" step="2" value="22" data-param="duration">
    </label>
  </div>
  <div class="co-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Coordinated omission simulator comparing open-loop, closed-loop, and corrected latency measurements with sample counts and queue depth"></canvas>
  <div class="co-lab__legend">
    <span><i style="background:#0f766e"></i> Open-loop</span>
    <span><i style="background:#be123c"></i> Closed-loop measured</span>
    <span><i style="background:#2563eb"></i> Closed-loop corrected</span>
    <span><i style="background:#7c3aed"></i> Queue depth</span>
    <span><i style="background:#d97706"></i> Service pause</span>
  </div>
  <p class="co-lab__note">
    Deterministic synthetic experiment. A single-server service receives either
    scheduled open-loop arrivals or closed-loop arrivals that wait for each
    response before sleeping. The corrected series uses the usual expected
    interval correction: a long observed latency contributes synthetic missed
    samples at latency minus one interval, minus two intervals, and so on.
  </p>
</div>
<script defer src="{{ '/assets/js/coordinated-omission-lab.js?v=20260613a' | relative_url }}"></script>

With the default settings, both benchmarks hit the same service model: an
ordinary service-time distribution plus periodic pauses. The open-loop generator
keeps issuing work during a pause. The closed-loop generator waits.

The result is the little horror show in the percentile panel. The open-loop p99
is much larger than the closed-loop p99. The service did not become faster. The
measurement contract changed.

The blue curve is a crude correction: when a closed-loop request takes much
longer than the expected interval, it adds the samples that would have been
observed had requests continued arriving on schedule. This correction is not a
substitute for a good experiment, but it is a useful confession:

```text
the red histogram did not contain enough time
```

Gil Tene popularized the term coordinated omission in the latency-measurement
community and built correction support into HdrHistogram-style measurement
workflows.[^tene] The core point is simple: if a 200 ms stall happens in a test
that should sample every 10 ms, recording one 200 ms event is not equivalent to
recording the experience of the roughly twenty scheduled arrivals affected by
that stall.

## A Stopwatch Is Also a Workload

Latency is usually written as:

$$
W = C - A,
$$

where $$A$$ is arrival time and $$C$$ is completion time. The hard part is not
the subtraction. The hard part is deciding what arrivals exist.

Closed-loop benchmarking changes the arrival process as a function of response
time. When the system slows down, the generator reduces load. That creates a
negative feedback loop:

```text
service gets slow
client waits
fewer arrivals are created
histogram sees fewer bad requests
service looks less slow
```

That loop can be appropriate if you are modeling one sequential user. It is
wrong if you are testing whether a service can survive independent arrivals at a
target rate. In that case, the arrival schedule should not ask the server for
permission.

This is why "requests per second" is not enough to describe a benchmark. You
also need to say whether the offered load was open-loop, whether arrivals were
paced, how concurrency was controlled, what happened after timeouts, and whether
the reported latency histogram corrected for coordinated omission.

## The Queue Keeps the Receipt

Little's Law says:

$$
L = \lambda W.
$$

Under broad steady-state conditions, the average number of jobs in the system
equals arrival rate times average time in the system.[^little] It is a small
equation with a large operational conscience. If arrivals keep coming and
service pauses, either work in progress rises or time in system rises. Usually
both rise during recovery.

Kingman's heavy-traffic approximation for a single-server queue adds another
warning:

$$
E[W_q]
\approx
\frac{\rho}{1-\rho}
\cdot
\frac{c_a^2+c_s^2}{2}
\cdot
E[S].
$$

As utilization $$\rho$$ approaches one, waiting time becomes violently sensitive
to variability.[^kingman] Higher service-time variance, burstier arrivals, and
less spare capacity are not cosmetic details. They are queue multipliers.

The lab's purple queue-depth line is the part a closed-loop client can hide. The
open-loop system accumulates a backlog during a pause, then spends time draining
it. A closed-loop client with only one request outstanding mostly observes a
single slow request and then resumes after the damage has passed.

Mor Harchol-Balter's queueing text is excellent on this kind of systems
intuition: performance is rarely only about mean service time; variability,
scheduling, and load shape decide the wait.[^harchol]

## Tail Latency Multiplies

Dean and Barroso's "The Tail at Scale" made the distributed-systems version of
this argument famous.[^dean-barroso] In a large fanout service, a user-visible
request may depend on many backend components. If each component is usually
fast, the maximum across many components can still be slow often enough to hurt
users. Rare hiccups become routine at scale.

That is why measuring the tail is not numerology. It is product work. A p99 can
be the difference between "one backend shard had a brief pause" and "a visible
fraction of users had a bad interaction."

But this only works if the p99 is computed from a sample stream that saw the bad
interactions. Coordinated omission is especially damaging in tail-at-scale
systems because the omitted samples are exactly the samples that would have
populated the tail.

## When Waiting Is the Workload

Closed-loop tests are not evil. They answer a different question.

Use a closed-loop benchmark when the real workload is closed-loop:

- one user waiting before issuing the next action;
- a batch worker that never has more than one task in flight;
- a protocol where backpressure is the product behavior;
- a system where the client population truly shrinks under delay.

Use an open-loop benchmark when the real workload has independent arrivals:

- many users arriving whether previous users completed or not;
- cron jobs, devices, or agents emitting on schedules;
- upstream services with their own queues;
- market data, telemetry, logs, or background jobs that keep flowing;
- capacity tests that ask what arrival rate the system can absorb.

And if you must use a closed-loop harness, report it honestly. Say what it
measures. Correct the histogram when the intended experiment was open-loop.
Show achieved throughput and omitted-sample estimates. Do not let the word p99
pretend to settle the matter.

## Latency Report Checklist

Before I trust a latency benchmark, I want to know:

- whether load generation was open-loop or closed-loop;
- the intended arrival schedule, not only achieved throughput;
- whether coordinated omission was corrected;
- whether pauses, timeouts, and cancellations were included in latency;
- whether queue wait and service time were separated;
- p50, p95, p99, p99.9, maximum, and sample count;
- whether latency was reported over time, not only as one final histogram;
- whether the benchmark ran past saturation and showed the knee;
- whether client-side think time was part of the workload model;
- whether the production workload has independent arrivals or sequential users.

The p99 is not a moral property of a service. It is a statistic of arrivals,
completions, and the measurement protocol that connected them.

So when a benchmark says:

```text
p99: 28 ms
```

the next question is:

```text
who was still sending requests while the server was slow?
```

If the answer is "nobody, because the benchmark was waiting too," then the
benchmark has joined the outage. It waited with the server, omitted the users
who would have arrived, and handed you a tail latency report with the tail
trimmed off.

## Sources

[^tene]: Gil Tene, ["How NOT to Measure Latency"](https://qconsf.com/sf2012/dl/qcon-sanfran-2012/slides/GilTene_HowNotToMeasureLatency.pdf), QCon San Francisco, 2012. Tene also discusses coordinated omission in the [Mechanical Sympathy forum](https://groups.google.com/g/mechanical-sympathy/c/icNZJejUHfE/m/BfDekfBEs_sJ), including expected-interval correction in HdrHistogram-style recorders.

[^little]: John D. C. Little, ["A Proof for the Queuing Formula: L = lambda W"](https://doi.org/10.1287/opre.9.3.383), *Operations Research*, 1961.

[^kingman]: J. F. C. Kingman, ["The single server queue in heavy traffic"](https://doi.org/10.1017/S0305004100036094), *Mathematical Proceedings of the Cambridge Philosophical Society*, 1961.

[^harchol]: Mor Harchol-Balter, [*Performance Modeling and Design of Computer Systems: Queueing Theory in Action*](https://www.cambridge.org/core/books/performance-modeling-and-design-of-computer-systems/743BEBB137B781EDBAFD807D8F7965DF), Cambridge University Press, 2013.

[^dean-barroso]: Jeffrey Dean and Luiz Andre Barroso, ["The Tail at Scale"](https://research.google/pubs/the-tail-at-scale/), *Communications of the ACM*, 2013. [DOI record](https://doi.org/10.1145/2408776.2408794).
