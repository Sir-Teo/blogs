---
layout: post
title: "The Bucket Becomes the Queue"
description: "Hash tables earn constant-time behavior from a distributional assumption. Hash-flooding attacks spend chosen input to break that assumption and turn one bucket into a CPU queue."
date: 2026-06-18 00:58:00 -0400
categories: computer-science
tags: [hash-tables, hash-flooding, algorithmic-complexity, siphash, security, data-structures]
excerpt: "A hash table does not promise O(1) against a caller who can choose many keys for the same bucket. The defense is not hope; it is keyed, unpredictable hashing plus explicit collision budgets."
---

A hash table usually feels like an array with a little math in front of it.

```text
bucket = hash(key) mod table_size
```

When the keys are friendly, or when the hash function behaves like a random
function for the workload, the table looks constant-time. Each bucket is short.
Lookup is a short walk. Insert is a short append.

But "expected constant time" is a bargain with the input distribution. It is
not a promise to an adversary who is allowed to choose the keys.

Hash flooding is what happens when that adversary buys one bucket and turns it
into the queue.

## Average Case Is Not A Security Boundary

Scott Crosby and Dan Wallach's 2003 USENIX Security paper framed a broader
class of algorithmic-complexity attacks: small inputs can force common data
structures out of their average case and into their worst case.[^crosby] Their
examples included hash tables in Perl, Squid, and Bro. The USENIX summary is
blunt: hash tables and binary trees can degenerate to linked lists when the
input is carefully chosen.[^crosby-usenix]

The mechanism for a chained hash table is painfully simple.

If `n` distinct keys all land in one bucket, and insertion checks for duplicates
by scanning the chain before appending, the comparison count is:

$$
0 + 1 + 2 + \cdots + (n-1)
= {n(n-1)\over 2}.
$$

That is not a micro-optimization failure. It is a different asymptotic regime
triggered by input.

```text
random-looking keys:      many short chains
chosen colliding keys:    one long chain
```

Open addressing has a different floor plan, but the same warning. A flood does
not need to break cryptography. It only needs enough control over bucket
selection to make the table do a lot of equality checks, probes, or
relocations per request.

## Salting Is Not Automatically A Wall

A tempting repair is:

```text
bucket = hash(secret, key) mod table_size
```

The word `secret` is doing real work only if the keyed function is hard to
predict from what the attacker can observe.

If the hash is structurally weak, adding a secret offset may merely move the
attacked bucket. In the lab below, the weak hash is an additive checksum:

```text
weak_hash(key, seed) = seed + sum(bytes(key))
```

The generated attack strings are all different, but every one has the same byte
sum. The seed changes the bucket number. It does not split the set.

That is why modern language runtimes moved toward keyed hash functions with a
cryptographic security goal. Aumasson and Bernstein introduced SipHash as a
fast pseudorandom function for short inputs, explicitly naming hash-table
lookups protected against hash-flooding denial-of-service attacks as a target
application.[^siphash] Their argument is not that collisions become impossible.
For a table with `m` buckets, collisions always exist. The point is that, with
an unpredictable keyed function, an attacker cannot cheaply manufacture a large
set of new keys for one chosen bucket.

Python's PEP 456 is a useful production record of that reasoning. It proposed
SipHash as the default string and bytes hash algorithm for Python 3.4 and says
the earlier FNV-based randomized scheme was not resilient against hash-collision
DoS attacks.[^pep456] It also states the core problem plainly: FNV has no
cryptographic properties, so randomization secrets can be calculated by a remote
attacker when the surrounding implementation leaks enough information.[^pep456-fnv]

The security boundary is not:

```text
there is a seed somewhere
```

It is closer to:

```text
given what the caller can see, can they predict many keys for the same bucket?
```

## Lab: The Same Keys Under Two Hashes

The lab below builds a simple chained hash table. It inserts the same keys
twice:

1. under the weak additive checksum;
2. under a small secret-mixer toy.

The second hash is **not SipHash** and is not a cryptographic recommendation.
It is only a visible stand-in for the mitigation principle: mix the whole key
with a secret in a way the attack strings were not built to defeat.

The attack key generator is real. For each key it creates five character pairs.
Each pair has a constant byte sum:

```text
az, by, cx, ...
```

Changing the pair changes the string, but not the additive checksum. That gives
thousands of distinct keys with one weak bucket.

With the default settings, the lab measures:

| Run | Value |
| --- | ---: |
| keys | 512 |
| buckets | 128 |
| weak max bucket | 512 |
| secret-mixer max bucket | 9 |
| weak insertion comparisons | 130,816 |
| secret-mixer insertion comparisons | 961 |
| weak lookup p95 | 512 |
| secret-mixer lookup p95 | 7 |
| insertion amplification | 136.1x |

<style>
  .hash-flood-lab {
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
  .hash-flood-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
    margin-bottom: 1rem;
  }
  .hash-flood-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .hash-flood-lab__controls input,
  .hash-flood-lab__controls select {
    accent-color: #be123c;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .hash-flood-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .hash-flood-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0 0 1rem;
  }
  .hash-flood-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .hash-flood-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .hash-flood-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .hash-flood-lab__metric--good strong {
    color: #0f766e;
  }
  .hash-flood-lab__metric--bad strong {
    color: #be123c;
  }
  .hash-flood-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .hash-flood-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 0.75rem;
  }
  .hash-flood-lab__legend span {
    align-items: center;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .hash-flood-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .hash-flood-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 720px) {
    .hash-flood-lab {
      padding: 0.75rem;
    }
    .hash-flood-lab__controls,
    .hash-flood-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="hash-flood-lab" data-hash-flood-lab>
  <div class="hash-flood-lab__controls">
    <label>
      Scenario
      <select data-param="scenario" aria-label="Hash-flood scenario">
        <option value="flood" selected>Same weak checksum</option>
        <option value="mixed">Flood plus ordinary keys</option>
        <option value="random">Ordinary keys</option>
      </select>
    </label>
    <label>
      Keys <output data-value="keys">512</output>
      <input type="range" data-param="keys" min="64" max="2048" step="64" value="512" aria-label="Inserted keys">
    </label>
    <label>
      Buckets <output data-value="buckets">128</output>
      <input type="range" data-param="buckets" min="32" max="512" step="32" value="128" aria-label="Bucket count">
    </label>
    <label>
      Hash seed <output data-value="seed">17</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="17" aria-label="Hash seed">
    </label>
    <label>
      Lookup misses <output data-value="lookupMix">35%</output>
      <input type="range" data-param="lookupMix" min="0" max="100" step="5" value="35" aria-label="Lookup miss share">
    </label>
  </div>
  <div class="hash-flood-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="720" aria-label="Hash flooding lab showing bucket occupancy, insertion comparisons, and lookup tail for weak checksum and secret keyed mixer"></canvas>
  <div class="hash-flood-lab__legend">
    <span><i style="background:#be123c"></i>Weak checksum</span>
    <span><i style="background:#0f766e"></i>Secret mixer toy</span>
    <span><i style="background:#6d28d9"></i>Amplification</span>
  </div>
  <p class="hash-flood-lab__note">
    Deterministic chained-table model. The secret mixer is a toy, not SipHash;
    it exists so the same attack keys can be run through a non-additive keyed
    hash in the browser.
  </p>
</div>

<script defer src="{{ '/assets/js/hash-flood-lab.js?v=20260618c' | relative_url }}"></script>

## What The Graph Should Make Uncomfortable

The bucket chart is the whole story. Under the weak checksum, the attack does
not make every bucket slightly worse. It makes one bucket enormous.

That matters because a request parser, JSON decoder, HTTP parameter collector,
or router table often builds a hash table while holding a worker thread. If the
attacker can make one request spend `O(n^2)` comparisons, a low-bandwidth input
becomes a high-CPU event.

The insertion curve shows the triangular number directly. With `512` keys in
one chain:

$$
{512\cdot511\over2}=130{,}816.
$$

The secret-mixer toy spends `961` comparisons on the same strings because the
strings no longer share a bucket. The improvement is not because chaining became
clever. The input no longer controls the bucket map.

## Audit Grid

The lab exports a Node audit that checks bucket accounting, finite outputs, the
triangular comparison count for the flood case, and the spread of the keyed
toy: five measured rows and 39 named checks.

| Scenario | Keys | Buckets | Weak comparisons | Keyed comparisons | Weak max bucket | Keyed max bucket | Amplification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| same weak checksum | 512 | 128 | 130,816 | 961 | 512 | 9 | 136.1x |
| same weak checksum | 1024 | 256 | 523,776 | 2,003 | 1024 | 12 | 261.5x |
| flood plus ordinary keys | 768 | 128 | 61,118 | 2,246 | 348 | 12 | 27.2x |
| ordinary keys | 768 | 128 | 2,412 | 2,334 | 15 | 13 | 1.0x |
| same weak checksum | 256 | 64 | 32,640 | 497 | 256 | 9 | 65.7x |

The ordinary-key row is important. It is the trap. The weak checksum can look
fine under a benign corpus. The security question is not whether the table
performs on your sample. It is whether the caller can cheaply move your sample
into the worst case.

To reproduce the deterministic audit grid from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/hash-flood-lab.js");
const EXPECTED_CASES = 5;
const EXPECTED_CHECKS = 39;
const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  keys: row.keys,
  buckets: row.buckets,
  weakComparisons: row.weakComparisons,
  keyedComparisons: row.keyedComparisons,
  weakMaxBucket: row.weakMaxBucket,
  keyedMaxBucket: row.keyedMaxBucket,
  amplification: row.amplification.toFixed(1) + "x",
  checks: `${row.passedChecks}/${row.totalChecks}`
})));
if (audit.total !== EXPECTED_CASES || audit.totalChecks !== EXPECTED_CHECKS) {
  throw new Error(
    `unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`
  );
}
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(`${summary}: ${JSON.stringify(failed, null, 2)}`);
}
console.log(summary);
NODE
```

## Defenses Are Layered

A keyed hash is a major defense because it makes bucket selection unpredictable
to the caller. It is not the whole system.

Practical defenses usually combine several limits:

- keyed, per-process hashing for attacker-controlled strings;
- request-size and parameter-count caps;
- parser budgets that fail closed before one request monopolizes a worker;
- collision telemetry, especially max chain length or probe length;
- fallback structures, such as tree bins, when one bucket grows too large;
- not exposing raw hash values or timing channels that help recover the secret.

The last point is why PEP 456's discussion is more subtle than "salt FNV." A
non-cryptographic hash can be fast and well distributed for ordinary inputs,
yet still leak enough algebraic structure for an adaptive attacker. SipHash's
selling point for hash tables is that it gives the hash function a PRF-style
unpredictability goal while staying fast on short strings.[^siphash-short]

## The Boundary Of The Toy

This post does not claim the toy keyed mixer is secure. It is not.

It also does not model every production table. CPython dictionaries are open
addressed, Java 8 can treeify long bins in `HashMap`, many runtimes resize and
probe in implementation-specific ways, and web frameworks often cap parameter
counts before the language hash table sees the full attack. Those details
matter.

The toy isolates one invariant:

```text
if a caller can choose many keys for one bucket, the table is no longer in its average case
```

Once that invariant is visible, the engineering review gets sharper. A hash
function is not only a spreader of keys. On a public input boundary, it is part
of the denial-of-service surface.

## Review Questions

Before trusting a hash table on attacker-controlled keys, I want the review to
answer:

- Is the hash function keyed per process or per table?
- Does it have a security goal, or only a distribution benchmark?
- Can users observe hash values, bucket indices, error timing, or collision
  behavior?
- What is the maximum accepted key count per request?
- What happens when a chain, probe run, or bucket crosses a threshold?
- Is the collision metric visible in production telemetry?

The constant-time story is still useful. It just needs its condition attached:

```text
expected O(1), assuming the caller cannot steer the distribution
```

When the caller can steer it, the bucket becomes the queue.

## Sources

[^crosby]: Scott A. Crosby and Dan S. Wallach, ["Denial of Service via Algorithmic Complexity Attacks"](https://www.usenix.org/conference/12th-usenix-security-symposium/denial-service-algorithmic-complexity-attacks), USENIX Security 2003.

[^crosby-usenix]: The USENIX paper page summarizes the result: low-bandwidth attacks can exploit average-case data structures, and the authors demonstrated attacks against Perl, Squid, and Bro hash-table implementations.

[^siphash]: Jean-Philippe Aumasson and Daniel J. Bernstein, ["SipHash: a fast short-input PRF"](https://cr.yp.to/siphash/siphash-20120918.pdf), 2012. The abstract names hash-table lookups protected against hash-flooding denial-of-service attacks as a target application.

[^siphash-short]: Aumasson and Bernstein, ["SipHash: a fast short-input PRF"](https://cr.yp.to/siphash/siphash-20120918.pdf), Section 7. They argue that a strong PRF makes bucket indices unpredictable even after selected observations, and that short-input performance is critical for hash-table applications.

[^pep456]: Christian Heimes, ["PEP 456: Secure and interchangeable hash algorithm"](https://peps.python.org/pep-0456/), Python Enhancement Proposals, final for Python 3.4. The PEP proposes SipHash as Python's default string and bytes hash algorithm.

[^pep456-fnv]: PEP 456, sections "Rationale" and "Current implementation with modified FNV." The PEP describes CPython's earlier FNV-style hash, the added prefix/suffix randomization, and why non-cryptographic hashing was not considered sufficient against hash-collision DoS attacks.
