---
layout: post
title: "Leases Need Fences"
description: "Lease expiry is a time-based promise, but stale side effects need an epoch check at the resource. A small simulator shows why clock padding and fencing tokens solve different bugs."
date: 2026-06-14 15:44:00 -0400
categories: software-engineering
tags: [distributed-systems, leases, fencing-tokens, clocks, chubby, truetime, reliability]
excerpt: "A lease can tell a coordinator when it is willing to move on. It cannot unsend an old request. For that, the resource needs a monotonically increasing epoch."
---

The bug report usually arrives with a word that sounds too strong:

```text
split brain
```

Two processes both acted as if they were primary. One was old and should have
been quiet. One was new and was supposed to be authoritative. The logs show a
lease expiry. The coordinator did reassign the lease. The new primary did its
job.

And then an old write landed late.

This post is about that late write. It is also about why a lease and a fence
are different objects, even though people often talk about them in the same
breath.

## Case File

Imagine a lock service that grants a lease:

```text
A holds leadership for object X until time T
```

That promise is useful. Gray and Cheriton's classic lease paper defines a lease
as a contract granting rights for a limited time, and in the cache-consistency
setting the server either gets approval from leaseholders before writing or
waits until their lease terms expire.[^gray-cheriton] Short leases are attractive
because a crashed or unreachable holder eventually stops blocking progress.

Now add production reality.

The old leader checks its lease, starts a write, and pauses. The pause might be
garbage collection, a page fault, scheduler delay, a stopped process, a slow
disk, or a packet that sits in a queue. While it is paused, the lease expires.
The lock service grants the next lease to a new leader. The new leader writes.
Then the old request finally reaches the storage system.

If the storage system only sees:

```text
write(key, value)
```

it has no way to know that the caller belongs to an old epoch.

The lock service was correct about its own state. The storage system still
accepted the wrong operation.

## The Lease Arithmetic

First separate the clock problem from the side-effect problem.

Suppose the coordinator considers the old lease expired at real time `T`. The
old holder's local clock may be behind by `s` milliseconds, where `s` is
negative for "slow." If the old holder checks:

```text
local_time <= T
```

then the old holder may believe the lease is valid until real time:

```text
T - s
```

If `s = -250 ms`, it may believe the lease is valid until `T + 250 ms`.

If the coordinator grants the new lease at:

```text
T + padding
```

then the old belief and new grant overlap whenever:

```text
padding < -s
```

That is the part clock uncertainty can solve. If you have a bound on skew,
message delay, or clock drift, you can wait out the bound. This is why serious
time-based systems expose uncertainty instead of hiding it. Spanner's TrueTime
API exposes clock uncertainty; Spanner's guarantees depend on that bound, and
the system waits when the uncertainty is too large.[^spanner] The public
Spanner documentation makes the same point in user-facing terms: TrueTime is
used to assign timestamps with cross-server monotonicity guarantees.[^truetime]

Lamport's older lesson sits underneath this. In a distributed system,
"happened before" is a partial order, and physical clocks are imperfect tools
that need explicit assumptions when specifications depend on physical
time.[^lamport]

But even perfect lease arithmetic does not solve the late-write problem.

## The Small Machine

The simulator below has two independent failure surfaces.

The first is **lease belief overlap**. A slow old clock plus too little
coordinator padding means the old holder may still believe its lease is valid
after the coordinator has regranted it.

The second is **stale side effect overwrite**. The old holder checks once, gets
paused, and later sends a write. Padding can make regrant conservative, but it
cannot reach into the storage system and reject a request that is already in
flight. For that, the resource needs a fencing token: a monotonically
increasing epoch attached to every protected operation.

<div class="lease-fencing-lab" data-lease-fencing-lab>
  <div class="lease-fencing-lab__controls">
    <label>
      Lease TTL <output data-value="leaseTtlMs">2000 ms</output>
      <input type="range" data-param="leaseTtlMs" min="500" max="5000" step="50" value="2000" aria-label="Lease TTL">
    </label>
    <label>
      Coordinator padding <output data-value="paddingMs">150 ms</output>
      <input type="range" data-param="paddingMs" min="0" max="900" step="25" value="150" aria-label="Coordinator padding">
    </label>
    <label>
      Old clock skew <output data-value="oldClockSkewMs">-250 ms</output>
      <input type="range" data-param="oldClockSkewMs" min="-900" max="900" step="25" value="-250" aria-label="Old clock skew">
    </label>
    <label>
      Pause starts <output data-value="pausePct">35%</output>
      <input type="range" data-param="pausePct" min="5" max="90" step="1" value="35" aria-label="Pause starts">
    </label>
    <label>
      Old leader pause <output data-value="pauseMs">2200 ms</output>
      <input type="range" data-param="pauseMs" min="0" max="5000" step="50" value="2200" aria-label="Old leader pause">
    </label>
    <label>
      Old write delay <output data-value="oldWriteMs">120 ms</output>
      <input type="range" data-param="oldWriteMs" min="0" max="1000" step="20" value="120" aria-label="Old write delay">
    </label>
    <label>
      New write delay <output data-value="newWriteMs">300 ms</output>
      <input type="range" data-param="newWriteMs" min="0" max="1000" step="20" value="300" aria-label="New write delay">
    </label>
  </div>
  <div class="lease-fencing-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Lease and fencing simulator showing clock overlap, paused old holder writes, and fenced storage outcomes"></canvas>
  <div class="lease-fencing-lab__legend">
    <span><i style="background:#2563eb"></i>Old lease</span>
    <span><i style="background:#7c3aed"></i>Padding</span>
    <span><i style="background:#0f766e"></i>New epoch or fence</span>
    <span><i style="background:#b45309"></i>Pause or old belief</span>
    <span><i style="background:#be123c"></i>Stale overwrite</span>
  </div>
  <p class="lease-fencing-lab__note">
    Deterministic toy model. The coordinator grants token 1 to the old holder
    and token 2 to the new holder. Without fencing, storage accepts writes in
    arrival order. With fencing, storage remembers the highest token observed
    and rejects lower-token writes that arrive later.
  </p>
</div>

<script defer src="{{ '/assets/js/lease-fencing-lab.js' | relative_url }}"></script>

Start with the default settings.

The old clock is 250 ms slow and the coordinator only waits 150 ms after nominal
expiry, so there is a 100 ms belief overlap. Increase **Coordinator padding**
to 300 ms. The overlap disappears.

But the stale overwrite remains.

The old leader paused after its earlier check, resumed, and sent its write at
3020 ms. The new leader wrote at 2450 ms. Without a fence, the old epoch writes
last and wins. With a fence, the storage system has already seen token 2, so it
rejects the late token-1 write.

Now lower **Old leader pause** until the sweep turns green. The old write
arrives before regrant, so this particular race is harmless. In the amber
region the old write is late but arrives before the new write, so the final
value is still new. In the red region, the old write arrives after the new
epoch's write; that is the classic stale overwrite.

The important observation is that the padding slider and the fence outcome are
solving different bugs.

## Why Rechecking Is Not Enough

A tempting repair is:

```text
check lease
write
```

or, if one has been burned once:

```text
check lease
do work
check lease again
write
```

That second check is better than nothing. It is not a proof.

The process can pause after the final check and before the write. The request
can be delayed after it leaves the process. The network can reorder packets.
The storage server can receive a message whose sender no longer has authority.
Kleppmann's writeup on distributed locking makes this point in exactly this
shape: a paused client or delayed packet can arrive after the lease has
expired, and fencing attaches an increasing token to writes so the storage
service can reject an older epoch after observing a newer one.[^kleppmann]

The phrase "after observing" matters.

Fencing is not telepathy. If the old token reaches the resource before any
newer token, a simple highest-token check may accept it and then later accept
the new token. That can still be linearized in storage order. What fencing
prevents is the old epoch overwriting or mutating state after the resource has
already moved to a newer epoch.

That is the common production safety boundary:

```text
new epoch effects must not be followed by old epoch effects
```

## Chubby's Version Of The Trick

Chubby is useful here because it is not a toy lock service. It was designed for
coarse-grained coordination at Google, with reliability and understandable
semantics prioritized over raw throughput.[^chubby]

The paper describes sessions maintained by KeepAlives. A session has a lease
timeout, and the client keeps a conservative approximation of the master's
lease timeout because it must account for reply delay and clock-rate
assumptions.[^chubby-sessions] When the client is unsure, it enters jeopardy
and blocks application calls rather than letting the application observe
inconsistent data.

Chubby also has a mechanism close to what this post calls a fence. A lock
holder can request a sequencer containing the lock name, mode, and generation.
The holder passes that sequencer to servers it talks to; those servers can
check whether the sequencer is valid, or compare against the most recent
sequencer they have observed.[^chubby-sequencer]

That design line is the post in miniature:

```text
lease service grants authority
resource checks the authority on the operation
```

If the resource cannot check, Chubby offers a lock-delay mechanism as an
imperfect mitigation for delayed or reordered requests. The adjective is doing
real work. Delay reduces the risk. It is not the same as an epoch check at the
resource.

## A Short Proof Sketch

Let the lock service issue a strictly increasing token on each acquisition:

```text
token(A) = 1
token(B) = 2
```

Let the protected resource store:

```text
max_seen_token
```

and accept an operation only if:

```text
request.token >= max_seen_token
```

then update `max_seen_token` when accepting the request.

If the resource accepts a token-2 operation before a token-1 operation arrives,
then `max_seen_token = 2` when token 1 is checked, and the old operation is
rejected. The old epoch cannot follow the new epoch at that resource.

The proof depends on two contracts:

- the lock service must generate monotonically increasing tokens;
- the resource must actually check them before applying side effects.

The lease alone is not one of those contracts. It is how the system eventually
moves authority. The token check is how the side-effect target recognizes
stale authority.

## The Practical Checklist

When I see a lease used as a lock, I now ask:

- What happens if the holder pauses after its last validity check?
- What happens if the write request is delayed after leaving the holder?
- Does every protected resource see a monotonic epoch, generation, zxid, term,
  version, or sequencer?
- Does the resource reject older epochs, or does the client merely promise not
  to send them?
- What clock-skew or drift bound appears in the lease proof?
- If the bound grows, does the system wait, fail closed, or keep pretending?
- Are we using delay as a mitigation where a fence is required for correctness?

The last distinction is the one that saves incidents from repeating.

A lease is a timed permission slip.

A fencing token is the bouncer at the door.

[^gray-cheriton]: Cary G. Gray and David R. Cheriton, ["Leases: An Efficient Fault-Tolerant Mechanism for Distributed File Cache Consistency"](https://www.andrew.cmu.edu/course/15-440/assets/READINGS/gray1989.pdf), *SOSP*, 1989.

[^lamport]: Leslie Lamport, ["Time, Clocks, and the Ordering of Events in a Distributed System"](https://amturing.acm.org/p558-lamport.pdf), *Communications of the ACM*, 1978.

[^spanner]: James C. Corbett et al., ["Spanner: Google's Globally-Distributed Database"](https://research.google.com/archive/spanner-osdi2012.pdf), *OSDI*, 2012.

[^truetime]: Google Cloud, ["Spanner: TrueTime and external consistency"](https://docs.cloud.google.com/spanner/docs/true-time-external-consistency).

[^chubby]: Mike Burrows, ["The Chubby lock service for loosely-coupled distributed systems"](https://research.google.com/archive/chubby-osdi06.pdf), *OSDI*, 2006.

[^chubby-sessions]: Burrows, Chubby, section 2.8. The paper describes session leases, KeepAlives, conservative client-side lease approximations, and jeopardy behavior during uncertainty.

[^chubby-sequencer]: Burrows, Chubby, sections 2.4 and 2.6. The paper describes lock sequencers and the expectation that recipient servers validate them or compare against observed sequencers.

[^kleppmann]: Martin Kleppmann, ["How to do distributed locking"](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html), 2016.
