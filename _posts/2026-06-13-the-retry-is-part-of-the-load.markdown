---
layout: post
title: "The Retry Is Part of the Load"
description: "Retries are not free resilience. Under overload, they can become a traffic generator pointed at the component already failing."
date: 2026-06-13 11:34:00 -0400
categories: computer-science
tags: [distributed-systems, reliability, retries, timeouts, backoff, tail-latency, software-engineering]
excerpt: "A retry policy is a load-shaping policy. If it is designed as local optimism, it can turn a small latency spike into a cascading failure."
---

The first retry feels innocent.

A request times out. Maybe the packet was lost. Maybe one replica was slow.
Maybe the connection pool handed us a bad socket. The client tries again, and
most of the time the second attempt works. The dashboard improves. Everyone
learns the same lesson:

```text
retries make unreliable systems reliable
```

That sentence is half true, which is the dangerous kind.

Retries can hide transient faults. They can also amplify overload. A retry is
not a prayer whispered outside the system. It is another request entering the
same queues, consuming the same workers, contending for the same connection
slots, and often asking the same unhealthy dependency to do more work.

The retry is part of the load.

<div class="callout">
  <strong>Reliability rule:</strong> a retry policy is a load-shaping policy. It
  should be designed with capacity, deadlines, idempotency, and overload in the
  loop.
</div>

## Tail Latency Is Contagious

Dean and Barroso's "The Tail at Scale" is the classic warning that large
distributed services are built from many small chances of slowness.[^tail] If a
root request fans out to many leaves, the root latency is often controlled by
the slowest leaf. Even if each leaf is fast 99 percent of the time, a request
that waits for 100 leaves has probability roughly

$$
0.99^{100} \approx 0.366
$$

of seeing every leaf finish under that same percentile threshold. The tail is
not rare anymore. Fanout turns rare local events into common global events.

This is why hedged requests can help: send a duplicate to another replica after
a short delay, use the first response, and cancel the other. The trick is that
hedging spends extra work to reduce tail latency. That can be a good trade when
the system has spare capacity and cancellations are effective. It is a terrible
trade when the system is already saturated.

Retries are a more common cousin of hedging. They also spend extra work for a
chance at lower user-visible failure. The difference is that retries usually
happen after a timeout, when the system has already given evidence that it may
be slow.

The hard question is therefore:

```text
is this retry sampling independent spare capacity,
or is it adding work to the queue that caused the timeout?
```

## Timeouts Are Not Failure Detectors

A timeout is a deadline chosen by the caller. It is not proof that the callee
failed.

If the timeout is too short, slow-but-healthy requests are converted into retry
traffic. If the timeout is too long, callers wait while resources remain tied
up. If a timeout does not cancel server-side work, the client can give up while
the server continues processing the first attempt. The retry then arrives while
the original attempt is still consuming capacity.

That produces work amplification. If a fraction $$p$$ of attempts time out and
each timeout triggers another attempt up to $$k$$ attempts, expected attempts
per root request are bounded by the geometric sum

$$
1 + p + p^2 + \cdots + p^{k-1}.
$$

That simple formula is already enough to show the shape of the problem. But
real systems are more vicious because $$p$$ is not fixed. When retries raise
load, queues grow; when queues grow, timeouts become more likely; when timeouts
become more likely, retries grow. The retry policy and the latency distribution
form a feedback loop.

Google's SRE material describes cascading failures as failures that grow through
positive feedback, often after overload shifts traffic onto remaining
capacity.[^cascade] The production best-practices chapter is blunt that retries
can amplify low error rates into much higher traffic and recommends dropping
traffic, including retries, upstream once load exceeds capacity.[^best]

That is the mental flip:

```text
under overload, a retry is not recovery work; it is competing work
```

## A Small Retry Laboratory

The lab below simulates a client calling a service with a fixed worker pool.
Original requests arrive at a chosen offered load. Each attempt enters a queue,
receives a service time with an optional slow tail, and has a client timeout. If
the attempt times out, the client may schedule another attempt with exponential
backoff and jitter, subject to a retry budget. Timed-out queued work may be
canceled with some probability; work already running may still finish too late
to help the user.

This is not a capacity-planning tool. It is a microscope for the feedback loop.

<div id="retry-lab" class="retry-lab" data-retry-lab>
  <div class="retry-lab__controls">
    <label>
      Offered load: <output data-value="offeredLoad">65%</output>
      <input type="range" min="35" max="130" step="5" value="65" data-param="offeredLoad">
    </label>
    <label>
      Slow-tail rate: <output data-value="slowTail">3.0%</output>
      <input type="range" min="0" max="25" step="1" value="3" data-param="slowTail">
    </label>
    <label>
      Timeout: <output data-value="timeoutMs">280 ms</output>
      <input type="range" min="40" max="500" step="10" value="280" data-param="timeoutMs">
    </label>
    <label>
      Max attempts: <output data-value="maxAttempts">2</output>
      <input type="range" min="1" max="4" step="1" value="2" data-param="maxAttempts">
    </label>
    <label>
      Backoff base: <output data-value="backoffMs">100 ms</output>
      <input type="range" min="0" max="400" step="20" value="100" data-param="backoffMs">
    </label>
    <label>
      Jitter: <output data-value="jitter">70%</output>
      <input type="range" min="0" max="100" step="5" value="70" data-param="jitter">
    </label>
    <label>
      Retry budget: <output data-value="retryBudget">15%</output>
      <input type="range" min="0" max="120" step="5" value="15" data-param="retryBudget">
    </label>
    <label>
      Cancel queued work: <output data-value="cancelEffectiveness">80%</output>
      <input type="range" min="0" max="100" step="5" value="80" data-param="cancelEffectiveness">
    </label>
  </div>
  <div class="retry-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Retry and timeout simulator showing original load, retry load, queue depth, latency, attempt fates, and policy gauges"></canvas>
  <div class="retry-lab__legend">
    <span><i style="background:#2563eb"></i> Original traffic</span>
    <span><i style="background:#b45309"></i> Retry traffic</span>
    <span><i style="background:#0f766e"></i> Capacity / success</span>
    <span><i style="background:#7c3aed"></i> Queue</span>
    <span><i style="background:#be123c"></i> Wasted work</span>
  </div>
  <p class="retry-lab__note">
    Deterministic simulation. A fixed 20-worker service processes requests with
    lognormal service times plus optional slow-tail events. The chart shows a
    12-second arrival window and lets queued/running work drain afterward.
  </p>
</div>
<script defer src="{{ '/assets/js/retry-load-lab.js?v=20260613a' | relative_url }}"></script>

Start with the default setting. The service has some tail latency, but it is not
overloaded. Retries improve success slightly while work amplification remains
close to one. Now raise **offered load** past 100 percent. The retry bars become
a second traffic source, queue depth rises, and the p99 gets worse even though
the policy was trying to improve reliability.

Set **jitter** to zero. Retries cluster into visible waves because clients share
the same backoff schedule. Jitter spreads the retries out. It does not create
capacity, but it prevents synchronized clients from hammering the service in
lockstep. This is the core lesson of Amazon's Builders' Library guidance on
timeouts, retries, backoff, and jitter.[^aws-timeouts] Brooker's separate
exponential-backoff-and-jitter post shows the same phenomenon in a contention
simulation: no-jitter backoff leaves clustered work; jitter spreads calls and
reduces wasted competition.[^aws-jitter]

Finally set **retry budget** to zero. Some transient failures remain visible,
but work amplification falls. Raise the budget again while the system is
overloaded. Success may not improve. That is the bitter lesson: retry budgets
are not bureaucracy. They are circuit breakers for client optimism.

## Layered Retries Multiply

The worst retry policies hide in stacks.

A browser retries. The edge retries. The API gateway retries. The service mesh
retries. The application client retries. The database driver retries. Each layer
sees a local timeout and believes another attempt is reasonable. The dependency
sees multiplication.

If five layers each allow three attempts, the bottom service can see as many as

$$
3^5 = 243
$$

attempts for one top-level operation in the unlucky case. AWS's guidance calls
out exactly this multiplicative failure mode and recommends retrying at a single
layer when possible, with careful budgets and backoff.[^aws-timeouts]

Layering is not the only problem. The operation must also be safe to repeat. A
retry of a read is usually easier than a retry of "charge this card," "create
this order," or "send this message." Idempotency keys turn a repeated request
into the same logical operation rather than a new operation with the same
payload. AWS's article on idempotent APIs frames this as an API contract: the
server needs a caller-provided request identity so safe retries can preserve the
client's intent.[^idempotent]

The rule I trust is:

```text
retry only where the operation is idempotent, the deadline still matters,
and the callee has capacity to absorb the retry
```

Miss any of the three and the retry is a gamble.

## Backoff Is Not a Cure for Overload

Backoff is useful when failures are brief, correlated clients need to desynchronize,
or a resource can recover if callers stop arriving all at once. It is not magic.

If original traffic keeps arriving above capacity, delaying retries simply moves
work into the future. The future is already booked. Backoff changes the shape of
the load; admission control changes the amount.

This distinction is why overload protection often needs explicit load shedding,
adaptive concurrency limits, and retry budgets. The USENIX work on adaptive
overload control for busy Internet servers is an older but useful example of the
same instinct: manage overload by bounding response-time behavior rather than
letting every request enter and discover the queue the hard way.[^overload]

A healthy retry design asks:

1. What is the caller's total deadline?
2. How many attempts can fit inside it?
3. Does retrying at this layer preserve idempotency?
4. Are retries counted against a budget?
5. Are retries lower priority than original traffic?
6. Does the client stop when the server says "overloaded"?
7. Are timed-out attempts canceled, and does cancellation actually reach the
   worker doing the work?

The last line is easy to miss. A timeout without cancellation is often just a
fork bomb with better logging.

## Hedging, Retries, and Shame

Hedged requests sometimes get dismissed as wasteful, while retries get treated
as prudent. That moral distinction is not technical. Both are duplicate work
policies. The difference is timing, cancellation, and budget.

Hedging can be responsible when it is delayed, rare, targeted at independent
replicas, and canceled aggressively after the first success. Retrying can be
irresponsible when it is immediate, layered, unbudgeted, and pointed at the same
overloaded backend. The right comparison is not "hedge bad, retry good." It is:

$$
\text{extra work}
\quad \text{versus} \quad
\text{tail reduction under the current load state}.
$$

That ratio changes over time. A policy that is healthy at 50 percent utilization
can be destructive at 105 percent utilization. A policy that helps a single user
can hurt the fleet.

This is the systems version of a familiar statistical mistake: optimizing a
local metric while ignoring selection effects. The requests that retry are not a
random sample. They are exactly the ones that encountered slowness, failure, or
congestion. Their second attempt enters a world conditioned on trouble.

## The Run Sheet

For a production service, I would want retry behavior in the same run sheet as
capacity and latency:

- per-endpoint timeout, max attempts, backoff, jitter, and retry budget;
- percent of traffic that is original versus retry;
- retry success rate by attempt number;
- work amplification by caller, endpoint, and dependency;
- p95 and p99 latency with retries disabled in a canary slice;
- cancellation propagation rate for timed-out requests;
- idempotency-key coverage for mutating operations;
- overload behavior: load shedding, retry-after signals, adaptive concurrency;
- whether retries are lower priority than first attempts;
- total deadline budget across the whole call graph.

The goal is not to ban retries. That would be theatrical and wrong. The goal is
to make retries visible as load. Once they are visible, they can be budgeted.

## A Research Direction

The experiment I would like to run next is a retry topology audit.

Take a service graph with real traces. Infer which layers retry, how many
attempts they permit, and whether attempts preserve a top-level request ID. Then
simulate incidents by replaying traffic through degraded dependency models:
one slow shard, one hot partition, one regional packet-loss event, one saturated
database pool. Compare policies:

```text
retry everywhere
retry only at the edge
retry only at the layer with idempotency keys
hedge only after p95
retry budget shared by caller and callee
retry-after honored by clients
```

The interesting metric is not only availability. It is availability per unit of
extra work during overload. A system that succeeds by spending 1.05x work is
different from one that succeeds by spending 3x work and collapses when the next
dependency slows down.

Retries are one of the most human parts of distributed systems. They encode
hope. The machine needs that hope bounded, jittered, idempotent, and measured.

## Notes

[^tail]: Jeffrey Dean and Luiz Andre Barroso, ["The Tail at Scale"](https://cacm.acm.org/research/the-tail-at-scale/), *Communications of the ACM*, 2013. See also the [Google Research record](https://research.google/pubs/the-tail-at-scale/).

[^cascade]: Google SRE, ["Addressing Cascading Failures"](https://sre.google/sre-book/addressing-cascading-failures/), in *Site Reliability Engineering*.

[^best]: Google SRE, ["Production Services: Best Practices"](https://sre.google/sre-book/service-best-practices/), in *Site Reliability Engineering*.

[^aws-timeouts]: Marc Brooker, ["Timeouts, retries, and backoff with jitter"](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/), Amazon Builders' Library.

[^aws-jitter]: Marc Brooker, ["Exponential Backoff And Jitter"](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), AWS Architecture Blog, 2015.

[^idempotent]: Malcolm Featonby, ["Making retries safe with idempotent APIs"](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/), Amazon Builders' Library.

[^overload]: Matt Welsh and David Culler, ["Adaptive Overload Control for Busy Internet Servers"](https://www.usenix.org/legacyurl/adaptive-overload-control-busy-internet-servers), USITS 2003.
