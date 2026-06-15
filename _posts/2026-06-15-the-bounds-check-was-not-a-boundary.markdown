---
layout: post
title: "The Bounds Check Was Not a Boundary"
description: "Spectre-style attacks broke a quiet assumption: discarded speculative work can still leave measurable traces in microarchitectural state."
date: 2026-06-15 10:07:00 -0400
categories: computer-science
tags: [spectre, side-channels, speculative-execution, computer-architecture, cache-timing, security]
excerpt: "A CPU can roll back the architectural mistake and still leave the cache rearranged. Spectre turned that gap into an information channel."
---

The program says no.

```text
if (x < array.length) {
  read array[x]
}
```

The architecture agrees. If `x` is out of bounds, the read should not happen.
The register file should not contain the forbidden value. The instruction
stream should continue down the correct path. The contract appears intact.

Spectre made that word, "appears," do too much work.

Modern processors do not wait politely for every branch, load, and dependency
to resolve. They predict. They run ahead. They execute work that may later be
declared wrong. When the prediction fails, the architectural state is rolled
back: registers, program counter, and memory behave as though the wrong-path
instructions never committed.

The cache is not the architecture.

```text
rolled-back work can still move
microarchitectural furniture
```

That is the hole. A transient instruction can touch a cache line selected by a
secret. The value is never architecturally returned, but the cache is now a
little warmer in one place. Measure the warmth carefully enough and the secret
becomes a timing distribution.

<div class="callout">
  <strong>Claim:</strong> Spectre is not just "the CPU had a bug." It is a
  mismatch between two notions of state: the architectural state software was
  taught to reason about, and the microarchitectural state performance hardware
  was allowed to mutate while guessing.
</div>

## The Two Ledgers

Computer architecture textbooks draw a clean line. The instruction set
architecture defines the state visible to software: registers, memory, traps,
and the order in which the program appears to execute. The microarchitecture is
how a particular processor implements that fiction: pipelines, reorder buffers,
branch predictors, caches, TLBs, store buffers, prefetchers, and speculation
machinery.

The fiction is not a lie. It is one of the great abstractions in computing.
Out-of-order execution can issue independent work early; branch prediction can
keep the pipeline fed; cache hierarchies can hide memory latency. At retirement,
the machine commits instructions in an order compatible with the architecture.

Security code often treated that as enough:

```text
if the forbidden load does not retire,
the forbidden value did not escape
```

Spectre showed that this statement is false. Kocher and collaborators described
attacks that induce a victim to speculatively execute instructions that would
not occur in the correct execution, then leak information through
microarchitectural side effects.[^spectre] The famous bounds-check-bypass shape
is only one member of the family, but it is the cleanest one to think with.

The pattern is:

1. Train or influence prediction so the CPU expects a bounds check to pass.
2. Present an out-of-bounds input.
3. During the transient window, use a secret-dependent value to touch a probe
   location.
4. Let the CPU squash the wrong path.
5. Measure which probe location is faster to read.

No architectural register needs to contain the secret after the squash. The
attacker reads the cache, not the register.

Yarom and Falkner's Flush+Reload attack predates Spectre and gives the timing
primitive its sharp edge: flush shared cache lines, let the victim run, then
reload and time which line came back quickly.[^flushreload] Spectre joins that
kind of side channel with transient execution. A wrong-path instruction becomes
the messenger.

Meltdown is related but different. It exploits out-of-order execution around
privilege checks to read kernel memory from user space on affected processors,
again using side effects to carry the value out.[^meltdown] A later
systematization by Canella, Van Bulck, Schwarz, Lipp, von Berg, Ortner,
Piessens, Evtyushkin, and Gruss helped organize the space under the broader
phrase transient execution attacks: speculation and faulting paths can leave
secret-dependent traces in microarchitectural state.[^canella]

## A Small Wrong-Path Lab

The lab below is not an exploit. It does not read memory, run native code, or
probe your processor. It is a deterministic model of the information channel.

There are 16 probe cache lines. One line is the secret. In the naive policy, a
mistrained bounds check sometimes opens a transient window. If the transient
load reaches the probe, the secret's line becomes faster. The attacker repeats
the experiment and votes for the fastest line.

The policies are sketches:

- **naive bounds check:** let wrong-path loads touch the visible cache;
- **fence before load:** wait until the unsafe branch is resolved;
- **mask unsafe index:** map the out-of-bounds index to a non-secret line;
- **touch every line:** make all probe lines look hot;
- **invisible speculation:** keep speculative cache effects hidden until commit.

The last one is hardware-shaped rather than ordinary application code. It is
included because proposals such as SafeSpec and InvisiSpec make the same design
move: speculative state should not become visible to other timing observers
until it is safe to commit.[^safespec] [^invisispec]

<style>
  .spectre-lab {
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

  .spectre-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .spectre-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .spectre-lab__controls input,
  .spectre-lab__controls select {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .spectre-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0;
  }

  .spectre-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .spectre-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .spectre-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .spectre-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .spectre-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .spectre-lab__legend span,
  .spectre-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .spectre-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .spectre-lab__note {
    margin: 0.7rem 0 0;
  }
</style>

<div class="spectre-lab" data-spectre-cache-lab>
  <div class="spectre-lab__controls">
    <label>
      Policy
      <select data-param="policy">
        <option value="naive">naive bounds check</option>
        <option value="fence">fence before load</option>
        <option value="mask">mask unsafe index</option>
        <option value="constant">touch every line</option>
        <option value="invisible">invisible speculation</option>
      </select>
    </label>
    <label>
      Seed <output data-value="seed">23</output>
      <input type="range" data-param="seed" min="1" max="90" step="1" value="23">
    </label>
    <label>
      Secret line <output data-value="secret">11</output>
      <input type="range" data-param="secret" min="0" max="15" step="1" value="11">
    </label>
    <label>
      Repeated probes <output data-value="rounds">36</output>
      <input type="range" data-param="rounds" min="4" max="160" step="4" value="36">
    </label>
    <label>
      Predictor training <output data-value="training">6</output>
      <input type="range" data-param="training" min="0" max="16" step="1" value="6">
    </label>
    <label>
      Transient window <output data-value="window">62%</output>
      <input type="range" data-param="window" min="0" max="100" step="1" value="62">
    </label>
    <label>
      Timing noise <output data-value="noise">25%</output>
      <input type="range" data-param="noise" min="0" max="100" step="1" value="25">
    </label>
    <label>
      Flush quality <output data-value="flush">88%</output>
      <input type="range" data-param="flush" min="0" max="100" step="1" value="88">
    </label>
  </div>
  <div class="spectre-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Speculative execution cache side-channel simulator showing transient trace, timing ledger, vote posterior, and mitigation frontier"></canvas>
  <div class="spectre-lab__legend">
    <span><i style="background:#be123c"></i> Fast or leaked line</span>
    <span><i style="background:#7c3aed"></i> Secret line</span>
    <span><i style="background:#2563eb"></i> Predictor training</span>
    <span><i style="background:#0f766e"></i> Hardened path</span>
    <span><i style="background:#64748b"></i> Miss or squash</span>
  </div>
  <p class="spectre-lab__note">
    Deterministic toy model. It audits 36 parameter settings for finite timing
    values, bounded vote counts, successful naive recovery under clean
    conditions, and lower secret signal under the sketched mitigations.
  </p>
</div>
<script defer src="{{ '/assets/js/spectre-cache-lab.js?v=20260615a' | relative_url }}"></script>

With the default naive policy, the secret is line `11`. The model guesses line
`11` with about `72%` confidence over 36 probes. That is the interesting part:
one wrong-path run is noisy, but repetition turns warmth into evidence.

Now switch to **fence before load**. Speculative rounds collapse because the
unsafe load waits for the branch. Switch to **mask unsafe index**. Speculation
can still happen, but the wrong-path touch is routed to a non-secret line.
Switch to **touch every line**. All lines become warm, so the timing channel
loses its one-hot code. Switch to **invisible speculation**. The speculative
load exists in the model's private staging area, but it does not update the
cache that the attacker can time.

The knobs matter:

- More **Predictor training** increases the chance of the wrong path.
- A larger **Transient window** gives the secret-dependent touch time to happen.
- More **Timing noise** makes the posterior need more repetitions.
- Lower **Flush quality** creates false hits and false misses.

This is why Spectre was not one bug with one patch. It was a new class of
interfaces between prediction, timing, compiler behavior, operating-system
isolation, and hardware design.

## The Bounds Check Still Matters

One tempting but wrong lesson is that bounds checks are useless. They are not.
Architecturally, the check still prevents the invalid read from committing.
The program's ordinary semantics are still protected.

The problem is that the check is only a boundary for retired state. Speculation
temporarily opens a second execution lane, and the second lane can touch shared
microarchitectural structures. A better slogan is:

```text
the bounds check guards the answer
not every trace of the question
```

LLVM's Speculative Load Hardening documentation states the Spectre v1 problem
plainly: speculative execution selects a path using prediction, may load values
while on that path, and may leak them through side channels that survive
unwinding.[^llvm-slh] Software mitigations try to make unsafe speculation
harmless. Hardware proposals try to prevent speculative effects from becoming
observable until the machine knows they should commit.

Both are difficult because performance hardware is full of shared state. Caches
are only the most famous channel. TLBs, predictors, ports, queues, and coherence
state can all become ledgers if an attacker can modulate them and measure them.
Canella et al.'s taxonomy is useful precisely because it pulls the conversation
away from one named vulnerability and toward the general pattern:

```text
transient cause
+ microarchitectural transmitter
+ measurement receiver
```

Security needs to reason about all three.

## Constant Time Was a Local Rule

Cryptographic programmers already knew to fear secret-dependent timing. Do not
branch on secrets. Do not index a table by a secret if the cache can reveal the
index. Prefer constant-time operations whose timing and memory footprint do not
depend on private data.

Spectre made that discipline less local. The programmer may write a check that
prevents the secret-dependent load on the architectural path, but the processor
may still speculatively run the load. The compiler may transform code in ways
that alter speculation behavior. A mitigation that is correct for one variant
may not cover another predictor or transient trigger.

This is why "constant time" becomes a contract between source code, compiler,
ISA, and microarchitecture. If any layer secretly creates a data-dependent
microarchitectural footprint, the proof lives in the wrong model.

The same lesson appears outside cryptography. Sandbox checks, JIT guards,
array bounds checks, kernel/user mappings, process boundaries, and container
assumptions all relied on a version of "the bad thing does not happen." Spectre
asks the more annoying question:

```text
does the bad thing leave a measurable
almost-happened?
```

## What I Would Put on the Design Review

For code that handles secrets on modern hardware, I would want a short
speculation review next to the ordinary memory-safety review:

- Which branches guard secret-dependent loads?
- Can an attacker influence predictor history before those branches?
- Are secrets used as cache indices, pointer offsets, or table selectors?
- Which fences, masks, or constant-time transformations are relied on?
- Can the compiler remove, weaken, or move those transformations?
- Which hardware, microcode, kernel, and compiler versions are in scope?
- Is the threat model local process, sandboxed script, VM neighbor, or remote
  timing observer?

Not every application needs the same answer. A tight cryptographic primitive
deserves more discipline than a batch job with no attacker-controlled input and
no secrets in the touched data. But the review should be explicit. Spectre's
lasting damage was to remove the comforting default that speculative work is
only a performance detail.

## The Machine Kept Its Promise, Narrowly

The eerie part of Spectre is that the CPU is not simply forgetting to roll back.
Architecturally, it often does roll back. The wrong-path instructions do not
retire. The illegal value does not appear where the ISA says it should not
appear.

The promise was narrower than the security argument needed.

Software wanted:

```text
if the check fails,
no information about the forbidden value
escapes
```

The hardware mostly promised:

```text
if the check fails,
the forbidden load does not
commit architecturally
```

Between those statements lives a cache line, a timer, and a lot of clever
performance engineering.

The bounds check was not a boundary.

It was one line in one ledger.

[^spectre]: Paul Kocher, Jann Horn, Anders Fogh, Daniel Genkin, Daniel Gruss, Werner Haas, Mike Hamburg, Moritz Lipp, Stefan Mangard, Thomas Prescher, Michael Schwarz, and Yuval Yarom, ["Spectre Attacks: Exploiting Speculative Execution"](https://arxiv.org/abs/1801.01203), IEEE Symposium on Security and Privacy, 2019.

[^flushreload]: Yuval Yarom and Katrina Falkner, ["FLUSH+RELOAD: A High Resolution, Low Noise, L3 Cache Side-Channel Attack"](https://www.usenix.org/conference/usenixsecurity14/technical-sessions/presentation/yarom), USENIX Security, 2014.

[^meltdown]: Moritz Lipp, Michael Schwarz, Daniel Gruss, Thomas Prescher, Werner Haas, Stefan Mangard, Paul Kocher, Daniel Genkin, Yuval Yarom, and Mike Hamburg, ["Meltdown: Reading Kernel Memory from User Space"](https://www.usenix.org/conference/usenixsecurity18/presentation/lipp), USENIX Security, 2018.

[^canella]: Claudio Canella, Jo Van Bulck, Michael Schwarz, Moritz Lipp, Benjamin von Berg, Philipp Ortner, Frank Piessens, Dmitry Evtyushkin, and Daniel Gruss, ["A Systematic Evaluation of Transient Execution Attacks and Defenses"](https://www.usenix.org/conference/usenixsecurity19/presentation/canella), USENIX Security, 2019.

[^safespec]: Khaled N. Khasawneh, Esmaeil Mohammadian Koruyeh, Chengyu Song, Dmitry Evtyushkin, Dmitry Ponomarev, and Nael Abu-Ghazaleh, ["SafeSpec: Banishing the Spectre of a Meltdown with Leakage-Free Speculation"](https://arxiv.org/abs/1806.05179), 2018.

[^invisispec]: Mengjia Yan, Jiho Choi, Dimitrios Skarlatos, Adam Morrison, Christopher W. Fletcher, and Josep Torrellas, ["InvisiSpec: Making Speculative Execution Invisible in the Cache Hierarchy"](https://iacoma.cs.uiuc.edu/iacoma-papers/micro18.pdf), MICRO 2018.

[^llvm-slh]: LLVM Project, ["Speculative Load Hardening"](https://llvm.org/docs/SpeculativeLoadHardening.html), documentation for a Spectre variant 1 mitigation.
