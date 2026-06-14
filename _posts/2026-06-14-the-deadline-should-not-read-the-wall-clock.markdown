---
layout: post
title: "The Stopwatch Is Not the Calendar"
description: "Wall clocks name calendar instants; monotonic clocks measure elapsed time. Mixing them turns NTP corrections, clock steps, and lease expiries into production bugs."
date: 2026-06-14 15:03:00 -0400
categories: software-engineering
tags: [timekeeping, monotonic-clocks, distributed-systems, timeouts, leases, reliability]
excerpt: "A timeout is a duration, not a date. If it reads the wall clock, a time correction can make a healthy request fail early or a dead request linger too long."
---

A timeout is not a timestamp. It is a promise about waiting.

That sounds too small to deserve a whole post. It is not. A surprising number
of reliability bugs begin when a program uses a clock that answers the wrong
question.

There are at least two questions hiding under the word "time":

```text
What time is it on the civil calendar?
How much time has elapsed since I started waiting?
```

The first question wants a wall clock. The second wants a monotonic clock.

On Linux, `CLOCK_REALTIME` is the system-wide wall clock. It can be set, and it
is affected by discontinuous changes to system time and by incremental
adjustments from mechanisms such as NTP. `CLOCK_MONOTONIC` is not settable and
does not go backward under discontinuous wall-clock jumps, though it can still
be slewed by incremental adjustments.[^clockgettime]

That distinction is the difference between:

```text
expire this cache entry at 2026-06-14T15:04:00-04:00
```

and:

```text
give this RPC 800 milliseconds to finish
```

The first is a date. The second is a stopwatch. Confusing them is how a tidy
line of code turns into a production incident.

## The Calendar Clock Has a Job

The wall clock is not bad. It is the right instrument for many jobs:

- log timestamps;
- calendar schedules;
- certificate validity windows;
- human-visible event times;
- cross-system approximate ordering when no stronger clock exists.

The wall clock's job is to agree, as best it can, with an external time scale.
That means it must sometimes be corrected. NTP exists because computer clocks
drift. RFC 5905 describes NTPv4 as a protocol widely used to synchronize
computer clocks across the Internet, with algorithms for clock discipline and
mitigation.[^ntp]

Correction is exactly what makes the wall clock dangerous for durations. If the
clock jumps forward while a request is waiting, a program that checks:

```text
Date.now() >= started_at + timeout
```

may conclude that 800 milliseconds elapsed after only 300 milliseconds of real
waiting. If the clock jumps backward, the same timeout may fail to fire long
after the intended budget is gone.

The bug is not that the wall clock is inaccurate. The bug is that a correcting
clock was asked to be a stopwatch.

## A Stopwatch Bug in Four Sliders

The lab below models two timeout policies:

- **Wall deadline:** store an absolute wall-clock deadline and compare the wall
  clock against it.
- **Monotonic deadline:** measure elapsed time from a monotonic clock.

It also includes a tiny lease model. A coordinator grants a lease with an
absolute expiry timestamp. The old holder decides whether it is still valid by
reading its own wall clock. If that holder's clock is behind or steps backward,
it may continue believing the lease is valid after the coordinator has already
regranted it.

<div class="wall-clock-lab" data-wall-clock-lab>
  <div class="wall-clock-lab__controls">
    <label>
      Timeout budget <output data-value="budgetMs">800 ms</output>
      <input type="range" data-param="budgetMs" min="150" max="2000" step="25" value="800" aria-label="Timeout budget">
    </label>
    <label>
      Operation duration <output data-value="operationMs">650 ms</output>
      <input type="range" data-param="operationMs" min="100" max="2500" step="25" value="650" aria-label="Operation duration">
    </label>
    <label>
      Clock adjustment
      <select data-param="mode" aria-label="Clock adjustment mode">
        <option value="none">None</option>
        <option value="step" selected>Step</option>
        <option value="slew">Slew</option>
        <option value="smear">Smear</option>
      </select>
    </label>
    <label>
      Adjustment size <output data-value="adjustMs">600 ms</output>
      <input type="range" data-param="adjustMs" min="-1200" max="1200" step="25" value="600" aria-label="Adjustment size">
    </label>
    <label>
      Adjustment time <output data-value="eventPct">40%</output>
      <input type="range" data-param="eventPct" min="5" max="95" step="1" value="40" aria-label="Adjustment time">
    </label>
    <label>
      Clock drift <output data-value="driftPpm">+0 ppm</output>
      <input type="range" data-param="driftPpm" min="-900" max="900" step="25" value="0" aria-label="Clock drift">
    </label>
    <label>
      Lease TTL <output data-value="leaseTtlMs">1200 ms</output>
      <input type="range" data-param="leaseTtlMs" min="300" max="3000" step="50" value="1200" aria-label="Lease TTL">
    </label>
    <label>
      Holder wall skew <output data-value="holderSkewMs">-250 ms</output>
      <input type="range" data-param="holderSkewMs" min="-900" max="900" step="25" value="-250" aria-label="Holder wall skew">
    </label>
  </div>
  <div class="wall-clock-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Wall clock and monotonic deadline simulator showing timeout errors, clock corrections, and lease overlap"></canvas>
  <div class="wall-clock-lab__legend">
    <span><i style="background:#be123c"></i>Wall clock</span>
    <span><i style="background:#0f766e"></i>Monotonic elapsed time</span>
    <span><i style="background:#7c3aed"></i>Deadline or regrant point</span>
    <span><i style="background:#2563eb"></i>Operation completion</span>
    <span><i style="background:#b45309"></i>Lease holder belief</span>
    <span><i style="background:#dc2626"></i>Overlap bug</span>
  </div>
  <p class="wall-clock-lab__note">
    This is a deterministic model, not an operating-system timer. It isolates
    the semantics: a wall-clock deadline is affected by steps, slews, drift, and
    skew; a monotonic elapsed-time deadline is not affected by discontinuous
    changes to civil time.
  </p>
</div>

<script src="{{ '/assets/js/wall-clock-deadline-lab.js' | relative_url }}"></script>

Start with the default. The operation would finish at 650 ms and the intended
timeout budget is 800 ms. A forward wall-clock step at 40 percent of the budget
makes the wall-clock timeout fire at about 320 ms of real time. The monotonic
deadline still fires at 800 ms, so the operation completes.

Now move **Adjustment size** negative. The wall clock steps backward. If the
operation is slow or wedged, the wall-clock timeout can wait hundreds of
milliseconds beyond the intended budget. In a real service, that late timeout
means sockets, worker slots, locks, or queue positions are held after the caller
believes the budget should have expired.

Switch from **Step** to **Slew** or **Smear**. The discontinuity disappears, but
the rate changes. That is gentler, and usually much safer, but it is still the
wrong abstraction for a duration when correctness depends on an exact elapsed
budget.

The lease panel is a second failure mode. The coordinator regrants at its lease
TTL. The holder compares an absolute expiry timestamp to its own wall clock. A
clock behind by 250 ms, or one that steps backward, can keep the old holder
inside its validity window after the coordinator has moved on. Bounded clock
uncertainty and conservative waiting are not optional decorations in lease
protocols. They are part of the correctness proof.

## Use a Stopwatch for Waiting

The reliable pattern for ordinary local waiting is:

```text
start = monotonic_now()
deadline = start + budget
while monotonic_now() < deadline:
  keep waiting
```

or, equivalently, pass a relative timeout to an API whose contract says it uses
a monotonic clock internally.

The dangerous pattern is:

```text
deadline = realtime_now() + budget
while realtime_now() < deadline:
  keep waiting
```

That second pattern is tempting because wall-clock timestamps are easy to print,
serialize, and compare. They look like facts. But a timeout budget is not a
fact about the calendar. It is a fact about elapsed work.

There are cases where an absolute deadline is the right interface. For example,
a request entering a service mesh may carry a deadline so downstream services do
not reset the budget at every hop. But even then the local act of waiting should
use a monotonic clock after converting the deadline into a remaining duration
under a well-defined clock contract. The absolute timestamp is a coordination
message; the local timer is still a stopwatch.

## A Lease Needs an Error Bound

Leases are time-based promises. Gray and Cheriton's classic lease paper proposed
leases as a way to provide efficient cache consistency in distributed systems;
short leases make failures affect performance rather than correctness under the
paper's assumptions.[^leases]

The phrase "under the assumptions" is where the engineering lives.

If a lease is valid until time \(T\), and machines disagree about what time it
is by at most \(\epsilon\), then a safe protocol can wait out that uncertainty.
If there is no bound, an expiry timestamp is not a proof that the old holder has
stopped acting. It is only a hope that the old holder's clock agrees enough.

This is the same shape as Spanner's TrueTime story, but at a more ambitious
scale. The Spanner paper describes a time API that exposes clock uncertainty;
its timestamp guarantees depend on bounded uncertainty, and when uncertainty is
large Spanner waits it out.[^spanner] The public Spanner documentation says
TrueTime lets applications generate monotonically increasing timestamps across
servers, and notes that using ordinary local clocks could assign timestamps in
the wrong order if one server's clock lagged.[^truetime]

The important part is not "Google has fancy clocks." The important part is:

```text
physical time is not a scalar when correctness depends on it;
it is an interval with an error budget
```

A single timestamp can be useful for logs. A lease or serial order needs the
uncertainty model that makes the timestamp meaningful.

## Clock Questions Before Code

For production code, I would want each clock use to answer one explicit
question:

- Is this value for human/civil time or elapsed duration?
- Can this clock move backward?
- Can this clock step forward?
- Does suspend time count?
- Is the timeout local, or is it a propagated request budget?
- If this is a lease, what clock-skew bound appears in the proof?
- If this is ordering, what happens when two machines disagree?

The checklist is intentionally plain. Most clock bugs are not caused by exotic
relativity. They come from using a calendar clock as a stopwatch, or using a
timestamp as if it carried a proof of global agreement.

The small rule survives many environments:

```text
wall clocks name instants;
monotonic clocks measure waiting;
distributed physical clocks need uncertainty
```

When the code forgets that, time does not fail dramatically. It just answers the
question it was actually asked.

[^clockgettime]: Michael Kerrisk, ["clock_gettime(3)"](https://man7.org/linux/man-pages/man3/clock_gettime.3.html), Linux man-pages. The page distinguishes `CLOCK_REALTIME`, which is affected by discontinuous system-time jumps and NTP adjustments, from `CLOCK_MONOTONIC`, which does not go backward under discontinuous system-time jumps.

[^ntp]: David L. Mills, Jim Martin, Jack Burbank, and William Kasch, ["Network Time Protocol Version 4: Protocol and Algorithms Specification"](https://datatracker.ietf.org/doc/html/rfc5905), RFC 5905, IETF, 2010.

[^leases]: Cary G. Gray and David R. Cheriton, ["Leases: An Efficient Fault-Tolerant Mechanism for Distributed File Cache Consistency"](https://dl.acm.org/doi/10.1145/74851.74870), *SOSP*, 1989. A public PDF is available from [CMU course materials](https://www.andrew.cmu.edu/course/15-440/assets/READINGS/gray1989.pdf).

[^spanner]: James C. Corbett et al., ["Spanner: Google's Globally-Distributed Database"](https://www.usenix.org/system/files/conference/osdi12/osdi12-final-16.pdf), *OSDI*, 2012.

[^truetime]: Google Cloud, ["Spanner: TrueTime and external consistency"](https://docs.cloud.google.com/spanner/docs/true-time-external-consistency).
