---
layout: post
title: "The Event Loop Is a Queue"
description: "Async I/O removes waiting, not work. A single slow callback can turn a calm service into a tail-latency machine unless the queue is visible and bounded."
date: 2026-06-16 18:52:00 -0400
categories: software-engineering
tags: [event-loop, backpressure, latency, nodejs, libuv, queueing, software-engineering]
excerpt: "The event loop is not a tiny parallel computer. It is the place where ready callbacks take turns. That distinction is where many latency incidents begin."
---

The event loop is easy to mythologize because it sounds like a loophole in
physics.

One thread. Many connections. Non-blocking I/O. Fast enough to make the old
thread-per-connection diagrams look heavy and Victorian.

The myth is not that event loops work. They do. The myth is that async I/O turns
all waiting into parallelism. It does not. It moves *some* waiting somewhere
else: into the kernel, into a poller, into a worker pool, into a database, into
another machine. When the operation is ready to resume, the callback comes back
to a single place and asks for time.

That place is the queue.

Node's own event-loop guide says the quiet part clearly: Node performs
non-blocking I/O even though a single JavaScript thread is used by default, in
part by offloading operations to the system kernel when possible.[^node-loop]
When those operations complete, callbacks are queued for eventual execution.
The same guide describes event-loop phases as FIFO queues of callbacks.[^node-loop]
The libuv design document is even more direct: the I/O loop is tied to a single
thread, network I/O is performed on non-blocking sockets, and callbacks are
fired from that loop.[^libuv]

So the useful mental model is not:

```text
async = everything is parallel
```

It is:

```text
async I/O = waiting can be multiplexed
callback CPU = ready work still serializes
```

This post is about that second line.

## A Calm Service With One Bad Callback

Imagine a server whose usual request path is boring:

1. accept a request;
2. wait for network or database I/O;
3. run a small JavaScript callback;
4. send the response.

Most of the time, step 2 dominates elapsed time, but it does not occupy the
event loop. Step 3 is tiny, but it does. That inversion is where tail latency
gets unintuitive. A 35 ms I/O wait can be harmless to the loop. A 45 ms CPU
callback can block everyone queued behind it.

The lab below simulates that distinction. Requests arrive, wait for synthetic
I/O, and then become ready callbacks. Ordinary callbacks are short. A small
fraction are slow CPU callbacks. You can queue everything, shed work when the
ready-callback backlog crosses a cap, or move the slow CPU portion to a worker
pool.

<style>
  .event-loop-lab {
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

  .event-loop-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
    margin-bottom: 1rem;
  }

  .event-loop-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .event-loop-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .event-loop-lab input[type="range"],
  .event-loop-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .event-loop-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
  }

  .event-loop-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .event-loop-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .event-loop-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .event-loop-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .event-loop-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .event-loop-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .event-loop-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .event-loop-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .event-loop-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .event-loop-lab {
      padding: 0.75rem;
    }

    .event-loop-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="event-loop-backpressure-lab" class="event-loop-lab" data-event-loop-lab>
  <div class="event-loop-lab__controls">
    <label>
      Arrivals: <output data-value="arrivalRate">150 / s</output>
      <input type="range" min="20" max="260" step="5" value="150" data-param="arrivalRate">
    </label>
    <label>
      Mean I/O wait: <output data-value="ioMs">35 ms</output>
      <input type="range" min="5" max="140" step="5" value="35" data-param="ioMs">
    </label>
    <label>
      Mean callback CPU: <output data-value="cpuMs">2.4 ms</output>
      <input type="range" min="0.4" max="8" step="0.2" value="2.4" data-param="cpuMs">
    </label>
    <label>
      Slow callbacks: <output data-value="heavyShare">4%</output>
      <input type="range" min="0" max="25" step="1" value="4" data-param="heavyShare">
    </label>
    <label>
      Slow CPU: <output data-value="heavyCpuMs">48 ms</output>
      <input type="range" min="8" max="120" step="2" value="48" data-param="heavyCpuMs">
    </label>
    <label>
      Backlog cap: <output data-value="queueLimit">90</output>
      <input type="range" min="8" max="240" step="4" value="90" data-param="queueLimit">
    </label>
    <label>
      CPU workers: <output data-value="workerThreads">off</output>
      <input type="range" min="0" max="4" step="1" value="0" data-param="workerThreads">
    </label>
    <label>
      Admission policy:
      <select data-param="policy">
        <option value="queue" selected>queue everything</option>
        <option value="shed">shed at cap</option>
      </select>
    </label>
    <label>
      Seed: <output data-value="seed">17</output>
      <input type="range" min="1" max="999" step="1" value="17" data-param="seed">
    </label>
  </div>
  <div class="event-loop-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Event-loop backpressure simulator showing callback backlog, event-loop delay, response latency, and work outcomes"></canvas>
  <div class="event-loop-lab__legend">
    <span><i style="background:#0f766e"></i> Backlog / normal callbacks</span>
    <span><i style="background:#2563eb"></i> Delay / latency</span>
    <span><i style="background:#be123c"></i> Slow inline CPU</span>
    <span><i style="background:#7c3aed"></i> Backlog cap</span>
    <span><i style="background:#b45309"></i> Worker offload</span>
    <span><i style="background:#64748b"></i> Shed work</span>
  </div>
  <p class="event-loop-lab__note">
    Deterministic synthetic experiment. I/O wait becomes a ready callback later;
    it does not consume event-loop CPU. Callback CPU and worker-completion
    callbacks do consume the event loop. Shed mode drops new ready callbacks
    when the simulated event-loop backlog has reached the cap.
  </p>
</div>
<script defer src="{{ '/assets/js/event-loop-backpressure-lab.js?v=20260616a' | relative_url }}"></script>

The default run is already enough to be uncomfortable. The offered CPU load is
not absurd. Most callbacks are small. The mean I/O wait is much larger than the
mean callback CPU. Still, rare slow callbacks create a visible ready-callback
backlog, and the p99 event-loop delay climbs into human-noticeable territory.

Set "Slow callbacks" to zero and the queue calms down. Bring it back. Then set
"CPU workers" to three. The p99 loop delay falls sharply because the slow CPU
portion no longer monopolizes the loop. Now raise arrivals and switch
"Admission policy" to "shed at cap." You will see the essential trade: accepted
requests get a bounded queue, but some requests are explicitly refused. The
system did not become infinitely faster. It became honest about overload.

That is the entire thesis in miniature:

```text
without backpressure, overload becomes waiting
with backpressure, overload becomes a product decision
```

## Nonblocking Does Not Mean Non-CPU

The phrase "do not block the event loop" is often heard as a style rule. It is
more severe than that. Node's guide says that a server stays speedy when the
work associated with each client at any given time is small, and that a blocked
event-loop thread cannot handle requests from other clients.[^node-block]

The part worth underlining is *other clients*. A callback is not only spending
its own budget. It is spending the scheduling budget of every ready callback
behind it.

This is why a function can be locally innocent and globally rude.

```js
app.get("/search", async (req, res) => {
  const rows = await db.query(req.query);
  const page = render(rows);      // synchronous CPU
  res.send(page);
});
```

The database wait may be multiplexed. The rendering is not, unless `render` is
itself broken into small pieces or moved away from the loop. JSON parsing,
schema validation, compression, template rendering, regex backtracking, crypto,
image transforms, giant array operations, and accidental quadratic loops all
have the same shape. They look like normal code until one input makes them
large.

The event loop does not care that the work began after an `await`. Once the
callback resumes, the loop is occupied until that turn finishes.

## The Old Lesson Was Explicit Queues

The staged event-driven architecture paper is from 2001, but its overload lesson
still feels modern. SEDA structures applications as event-driven stages
connected by explicit queues; that lets the service inspect load, tune resource
use, batch events, and shed work when demand exceeds capacity.[^seda]

The important word is *explicit*. If the queue is visible, it can have policy.
If it is invisible, it becomes an accident:

- a growing in-memory array;
- a socket buffer nobody is watching;
- a promise chain that keeps allocating;
- a database connection pool with no useful deadline;
- an event loop whose delay is only noticed after users complain.

An unbounded queue is not kindness. It is a way to turn an overload incident
into a latency incident, then into a memory incident, then into a restart.

Backpressure is the opposite bargain. It says:

```text
there is a limit to how much unfinished work we will admit
```

That limit can be expressed as load shedding, 503s, `Retry-After`, pausing reads,
bounded queues, per-tenant concurrency, deadlines, rate limits, or refusing to
start optional work. The form depends on the product. The principle is the same:
work that cannot be served within a useful budget should not silently become
infinite waiting.

## The C10K Ghost

The C10K problem was never just "can one machine keep ten thousand sockets
open?" Dan Kegel's old survey is full of concrete blocking hazards: if a
nonthreaded server hits disk I/O that blocks, all clients wait; asynchronous I/O
or worker threads can route around that specific bottleneck.[^c10k]

That distinction matters because it keeps the event-loop story from becoming
religious. Threads are not evil. Events are not magic. Lauer and Needham's
classic duality paper argued that message-oriented and procedure-oriented
systems can be duals under comparable scheduling strategies, with the substrate
often deciding which model is more natural.[^duality] The real question is not
"events or threads?" It is:

```text
where are the queues, who schedules them, and what happens at saturation?
```

Worker threads are one answer for CPU-heavy work, but they do not delete the
question. They move the queue. In the lab, worker offload usually improves event
loop delay because the main loop only pays a small submit callback and a small
completion callback. Raise the slow-callback fraction high enough, though, and
the worker p95 wait starts to matter. The bottleneck has moved from the loop to
the worker pool.

That can still be a win. It is just not a free lunch.

## What To Measure

CPU utilization can be misleading for event-loop services. A process can have
plenty of idle CPU and still have a sick loop if one synchronous operation is
holding the turn. Node's `perf_hooks.monitorEventLoopDelay()` exists precisely
to sample event-loop delay; the docs note that timer delay reflects delay in the
libuv event loop lifecycle.[^perf-hooks]

For a production service, I want at least these signals:

- event-loop delay percentiles over time;
- event-loop utilization, not only process CPU;
- callback or handler duration histograms;
- queue depth for every explicit pool, stream, and work queue;
- admitted, completed, timed-out, canceled, retried, and shed counts;
- response latency split into queue wait and service time when possible;
- per-route and per-tenant versions of the above, because averages hide bullies.

The split matters. If p99 response latency rises, the service time might be
slow. Or the service might be fine but queued behind a blocker. Or I/O might be
slow. Or admission might be too generous. The remedy changes with the phase.

## Small Turns Are A Fairness Policy

The most practical event-loop rule is also the least glamorous:

```text
make each turn small
```

Small turns mean a callback does bounded work before yielding. They do not mean
"never do CPU work." They mean CPU work has a budget, a route, and a failure
mode.

Some useful patterns:

- bound input sizes before parsing, rendering, validating, or matching;
- put deadlines around optional work, not only around network calls;
- stream large responses instead of constructing one giant object;
- move CPU-heavy or variable-cost work to workers or another service;
- keep worker pools bounded and observable;
- make load shedding cheaper than accepting work;
- split long local loops with a scheduler yield only when that preserves
  correctness and memory bounds;
- measure event-loop delay in the same dashboard as request latency.

None of this is Node-specific. Browser UIs, Python `asyncio`, Ruby reactors,
single-threaded game loops, GUI toolkits, Redis-style servers, and any actor
system with a hot mailbox all share the same warning. A single executor can
hide enormous concurrency in waiting, but ready work still takes turns.

The event loop is a good servant when its turns are small. It is a terrible
place to hide an unpriced queue.

## Further Reading

[^node-loop]: Node.js documentation, ["The Node.js Event Loop"](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick). The guide describes non-blocking I/O with a single JavaScript thread by default, callback queues in event-loop phases, and the poll phase that retrieves I/O events.

[^libuv]: libuv documentation, ["Design overview"](https://docs.libuv.org/en/v1.x/design.html). The design notes describe the I/O loop as tied to a single thread, using non-blocking sockets and platform poll mechanisms; they also distinguish network I/O from file I/O that may use the thread pool.

[^node-block]: Node.js documentation, ["Don't Block the Event Loop (or the Worker Pool)"](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop). The guide frames blocking as long-running callbacks or worker tasks that prevent progress for other clients.

[^seda]: Matt Welsh, David Culler, and Eric Brewer, ["SEDA: An Architecture for Well-Conditioned, Scalable Internet Services"](https://www.cs.princeton.edu/courses/archive/fall13/cos518/papers/seda.pdf), SOSP 2001. See also the [ACM DOI record](https://doi.org/10.1145/502034.502057).

[^c10k]: Dan Kegel, ["The C10K problem"](https://www.kegel.com/c10k.html). The historical survey is still useful because it separates readiness notification, blocking disk I/O, asynchronous I/O, and worker-thread workarounds.

[^duality]: Hugh C. Lauer and Roger M. Needham, ["On the Duality of Operating System Structures"](https://www.cs.umass.edu/~emery/classes/cmpsci691w-spring2006/duality78.pdf), 1978. The paper argues that message-oriented and procedure-oriented operating-system structures have direct counterparts under comparable scheduling assumptions.

[^perf-hooks]: Node.js API documentation, [`perf_hooks.monitorEventLoopDelay()`](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions). The API samples event-loop delay and reports an interval histogram.
