---
layout: post
title: "The Password Hash Rents Memory"
description: "A password hash is not just a slow hash. Memory-hard schemes make offline guessing rent RAM, burn bandwidth, carry per-user salts, and fit inside a real login latency budget."
date: 2026-06-18 09:56:00 -0400
categories: computer-science
tags: [password-hashing, argon2, scrypt, memory-hard-functions, authentication, security, cryptography]
excerpt: "A leaked password table changes the game from online login attempts to offline search. The hash has to make every guess rent memory, not merely wait politely."
---

A password hash is easy to describe too small:

```text
store hash(password)
```

That line is missing the adversary. The interesting event is not a normal login.
The interesting event is a database leak. Once the password table is gone, the
attacker is no longer asking your server for permission. They are running an
offline search over candidate passwords, comparing each candidate with the stored
verifier.

So the stored password verifier is not a checksum. It is a recurring invoice:

```text
one password guess = time + memory + bandwidth + salt-specific work
```

The verifier has to be cheap enough that a real user can log in, but expensive
enough that a leaked table does not become a parallel guessing festival.

That is the small design tension behind memory-hard password hashing.

## The Hash Is A Guessing Budget

NIST SP 800-63B says verifiers should store passwords in a form resistant to
offline attack; the current SP 800-63-4 text describes a password hashing scheme
as taking a password, salt, and cost factor, then making each password guess more
expensive for someone who has obtained the hashed password file.[^nist]

That sentence is doing more work than it first appears to do.

First, this is an **offline** threat. Online rate limits, lockouts, step-up
authentication, and anomaly detection matter, but they are not in the hot path
after the table leaks. A stolen table turns the defense into arithmetic.

Second, the salt is not meant to be secret. Its job is to keep work from being
reused. NIST requires at least 32 bits and says salts should be chosen to
minimize collisions among stored hashes; RFC 9106 recommends 16-byte salts for
Argon2 password hashing.[^argon2-inputs] In practice, larger random salts are
normal because storage is cheap and accidental reuse is embarrassing.

Third, the cost factor is not a moral gesture. It is an operational budget. Set
it too low and offline search is cheap. Set it too high and login becomes a
self-inflicted denial of service.

The security engineering question is therefore:

```text
what is the largest per-login bill we can afford to hand to honest users?
```

## Why Memory Changes The Attack Shape

Classic iterated hashes mostly charge time. That helps, but offline search is
embarrassingly parallel: buy more hardware, run more guesses. Percival and
Josefsson's scrypt RFC makes the hardware economics explicit: if attackers can
use custom parallel circuits, the relevant unit is closer to dollar-seconds than
to one machine's wall-clock time.[^scrypt]

Memory-hard schemes try to make parallel guesses rent scarce area too. A design
that demands 64 MiB per guess cannot be packed into the same hardware shape as a
design that demands 64 bytes per guess. The attacker now has to answer:

```text
how many guesses can I keep resident at once?
what memory bandwidth feeds them?
what happens if I store less and recompute missing blocks?
```

Argon2 is the modern reference point. RFC 9106 describes Argon2 as a memory-hard
function, names Argon2id as the primary variant to support, and gives two
notable default recommendations: Argon2id with 2 GiB, 1 pass, 4 lanes, and a
128-bit salt as the first recommended option; and Argon2id with 64 MiB, 3 passes,
4 lanes, and a 128-bit salt when much less memory is available.[^argon2-rec]

Those recommendations are not "64 MiB is always enough" or "2 GiB is always
practical." They are reminders that the password hash has knobs with different
physical meanings:

- **memory** limits parallel resident guesses;
- **passes** add repeated work over the memory;
- **lanes** expose parallelism inside one verifier call;
- **salt** prevents one computation from being spent against many accounts;
- **tag and algorithm metadata** let you migrate later.

The hash string should carry the algorithm and cost parameters, because tomorrow
you may need to rehash at a higher cost after a successful login.

## Lab: Spend The Login Budget

The lab below is not an Argon2 implementation and not a hardware benchmark. It
is a static economics model with deliberately plain assumptions:

```text
defender latency ~= fixed overhead + passes * memory / effective bandwidth
attacker slots   ~= attacker memory / per-guess memory
attacker rate    ~= min(slot-limited rate, bandwidth-limited rate)
```

For the time-memory tradeoff control, the lab uses a toy penalty:

```text
penalty(alpha) = alpha^-1.45
```

where `alpha` is the fraction of full memory used. That is not a claim about a
specific attack on Argon2. It is a visible contract: in this model, cutting
memory buys more slots but pays for recomputation. RFC 9106's security section
discusses real time-space tradeoff attacks in terms of time-area product, and
real deployments should rely on the scheme's own analysis and current library
guidance rather than this toy exponent.[^argon2-tradeoff]

Default model:

| Quantity | Value |
| --- | ---: |
| Memory per hash | `64 MiB` |
| Passes | `3` |
| Lanes | `4` |
| Defender latency | `105 ms` |
| Attacker memory budget | `24 GiB` |
| Concurrent full-memory guesses | `384` |
| Offline hash evaluations | `729/s` |
| 40-bit single-target median | `23.9 y` |
| 10,000-account breach, unique salts | `33.1 y` |
| Same breach, shared salt | `1.21 d` |

The last two rows are the point of the salt panel. For one target, a salt does
not make the chosen password stronger. For a breached table, unique salts stop
one candidate word from being checked against every account with one KDF
evaluation.

<style>
  .password-lab {
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
  .password-lab *,
  .password-lab *::before,
  .password-lab *::after {
    box-sizing: border-box;
  }
  .password-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }
  .password-lab label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }
  .password-lab input[type="range"],
  .password-lab select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }
  .password-lab select {
    padding: 0.35rem 0.45rem;
  }
  .password-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .password-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0 0 1rem;
  }
  .password-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9f0;
    border-radius: 7px;
    padding: 0.55rem 0.65rem;
  }
  .password-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .password-lab__metric strong {
    color: #172026;
    display: block;
    font-size: clamp(1rem, 2vw, 1.22rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
  }
  .password-lab__metric--good strong {
    color: #0f766e;
  }
  .password-lab__metric--warn strong {
    color: #b45309;
  }
  .password-lab canvas {
    aspect-ratio: 900 / 640;
    border: 1px solid #e3e9f0;
    border-radius: 8px;
    display: block;
    max-width: 100%;
    width: 100%;
  }
  .password-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    line-height: 1.55;
    margin: 0.8rem 0 0;
  }
  @media (max-width: 600px) {
    .password-lab {
      padding: 0.8rem;
    }
    .password-lab canvas {
      aspect-ratio: 360 / 980;
    }
  }
</style>

<div class="password-lab" data-password-hash-lab>
  <div class="password-lab__controls">
    <label>
      Memory per hash <output data-value="memory">64 MiB</output>
      <input data-param="memory" type="range" min="16" max="2048" step="16" value="64" aria-label="Memory per password hash">
    </label>
    <label>
      Passes <output data-value="passes">3</output>
      <input data-param="passes" type="range" min="1" max="6" step="1" value="3" aria-label="Password hash passes">
    </label>
    <label>
      Lanes <output data-value="lanes">4</output>
      <input data-param="lanes" type="range" min="1" max="8" step="1" value="4" aria-label="Parallel lanes">
    </label>
    <label>
      Attacker memory <output data-value="attackerMemory">24 GiB</output>
      <input data-param="attackerMemory" type="range" min="4" max="512" step="4" value="24" aria-label="Attacker memory budget">
    </label>
    <label>
      Memory tradeoff <output data-value="tradeoff">full memory</output>
      <select data-param="tradeoff" aria-label="Attacker time memory tradeoff">
        <option value="full" selected>full memory</option>
        <option value="half">1/2 memory</option>
        <option value="quarter">1/4 memory</option>
        <option value="eighth">1/8 memory</option>
      </select>
    </label>
    <label>
      Search space <output data-value="bits">40 bits</output>
      <input data-param="bits" type="range" min="24" max="64" step="1" value="40" aria-label="Password search space in bits">
    </label>
    <label>
      Breached accounts <output data-value="accounts">10,000</output>
      <input data-param="accounts" type="range" min="1" max="1000000" step="999" value="10000" aria-label="Breached account count">
    </label>
    <label>
      Salt model <output data-value="salt">unique salts</output>
      <select data-param="salt" aria-label="Salt reuse model">
        <option value="unique" selected>unique salts</option>
        <option value="shared">shared salt</option>
      </select>
    </label>
  </div>
  <div class="password-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Password hashing memory-hardness lab showing defender latency, attacker memory slots, crack horizon, and salt reuse economics"></canvas>
  <p class="password-lab__note" data-note>
    Loading password hash model.
  </p>
</div>

<script defer src="{{ '/assets/js/password-hash-lab.js?v=20260618c' | relative_url }}"></script>

The audit exported by the script runs 12 named critical checks plus 216
generated checks over a 72-row memory/pass/tradeoff/salt grid:

```bash
node - <<'NODE'
const lab = require("./assets/js/password-hash-lab.js");
const EXPECTED_CRITICAL_CHECKS = 12;
const EXPECTED_ROWS = 72;
const EXPECTED_CASES = 228;
const EXPECTED_CHECKS = 228;
const EXPECTED_DEFAULT_SHAPE =
  "64:3:4:105.111:384:729.167:10000:128:1";
const EXPECTED_MEMORY_SHAPE = [
  "16:18/54:53.753:195.375:18",
  "64:18/54:113.012:48.844:18",
  "256:18/54:350.049:12.211:18",
  "1024:18/54:1298.198:3.053:0"
];
const EXPECTED_PASSES_SHAPE = [
  "1:24/72:159.926:18.316:18",
  "3:24/72:411.778:6.105:18",
  "6:24/72:789.556:3.053:18"
];
const EXPECTED_TRADEOFF_SHAPE = [
  "full:24/72:453.753:10.392:18",
  "half:24/72:453.753:7.607:18",
  "quarter:24/72:453.753:3.053:18"
];
const EXPECTED_SALT_SHAPE = [
  "shared:36/108:453.753:1.000:1585928.894:27",
  "unique:36/108:453.753:1000.000:1585928894.382:27"
];
const EXPECTED_CRITICAL_SHAPE = [
  "72-case password hash grid completed:1/1",
  "default latency is finite:1/1",
  "quarter-memory tradeoff does not improve total rate in toy model:1/1",
  "raising memory lowers attacker rate in model:1/1",
  "raising memory raises defender latency:1/1",
  "raising passes lowers attacker rate in model:1/1",
  "raising passes raises defender latency:1/1",
  "server concurrency budget is memory divided by per-login memory:1/1",
  "shared salt accelerates breach-wide search:1/1",
  "shared salt lets one KDF cover the breach word:1/1",
  "toy tradeoff penalty is memory-hard shaped:1/1",
  "unique salts force one KDF per account per word:1/1"
];
const EXPECTED_TOTALS = {
  criticalChecks: EXPECTED_CRITICAL_CHECKS,
  rows: EXPECTED_ROWS,
  passed: true,
  passedChecks: EXPECTED_CHECKS,
  total: EXPECTED_CASES,
  totalChecks: EXPECTED_CHECKS
};

function fixed3(value) {
  return Number(value).toFixed(3);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function defaultShape(row) {
  return [
    row.params.memory,
    row.params.passes,
    row.params.lanes,
    fixed3(row.latencyMs),
    row.attackerSlots,
    fixed3(row.hashRate),
    row.evalsPerDictionaryWord,
    row.maxConcurrentLogins,
    row.serverBudgetOk ? 1 : 0
  ].join(":");
}

function groupShape(row, key) {
  return [
    row[key],
    `${row.cases}/${row.totalChecks}`,
    fixed3(row.avgLatencyMs),
    fixed3(row.minHashRate),
    row.serverBudgetOk
  ].join(":");
}

function saltShape(row) {
  return [
    row.salt,
    `${row.cases}/${row.totalChecks}`,
    fixed3(row.avgLatencyMs),
    fixed3(row.avgEvalsPerDictionaryWord),
    fixed3(row.avgBreachMedianSeconds),
    row.serverBudgetOk
  ].join(":");
}

const audit = lab.auditPasswordHashLab();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedCriticalChecks = audit.criticalChecks.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
console.log(audit.defaultResult);
console.table(audit.byMemory);
console.table(audit.byPasses);
console.table(audit.byTradeoff);
console.table(audit.bySalt);
console.table(audit.criticalChecks);
const auditShape = {
  defaultResult: defaultShape(audit.defaultResult),
  totals: {
    criticalChecks: audit.criticalTotal,
    rows: audit.cases.length,
    passed: audit.passed,
    passedChecks: audit.passedChecks,
    total: audit.total,
    totalChecks: audit.totalChecks
  },
  byMemory: audit.byMemory.map((row) => groupShape(row, "memory")),
  byPasses: audit.byPasses.map((row) => groupShape(row, "passes")),
  byTradeoff: audit.byTradeoff.map((row) => groupShape(row, "tradeoff")),
  bySalt: audit.bySalt.map(saltShape),
  criticalChecks: audit.criticalChecks.map(
    (row) => `${row.check}:${row.passedChecks}/${row.totalChecks}`
  ).sort()
};
const shapeErrors = [
  sameJson(auditShape.defaultResult, EXPECTED_DEFAULT_SHAPE) ? null : "defaultResult",
  sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
  sameJson(auditShape.byMemory, EXPECTED_MEMORY_SHAPE) ? null : "byMemory",
  sameJson(auditShape.byPasses, EXPECTED_PASSES_SHAPE) ? null : "byPasses",
  sameJson(auditShape.byTradeoff, EXPECTED_TRADEOFF_SHAPE) ? null : "byTradeoff",
  sameJson(auditShape.bySalt, EXPECTED_SALT_SHAPE) ? null : "bySalt",
  sameJson(auditShape.criticalChecks, EXPECTED_CRITICAL_SHAPE) ? null : "criticalChecks"
].filter(Boolean);
if (shapeErrors.length) {
  throw new Error(
    `audit grid drifted in ${shapeErrors.join(", ")}:\n` +
    JSON.stringify(auditShape, null, 2)
  );
}
if (
  failed.length ||
  failedCriticalChecks.length ||
  !audit.ok ||
  !audit.passed ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    failed,
    failedCriticalChecks,
    shapeErrors,
    auditShape,
    passed: audit.passed,
    passedChecks: audit.passedChecks,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(`${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

It verifies monotone behavior for memory and passes, the salt accounting, the
time-memory tradeoff shape, the server memory budget calculation, and a 72-case
grid over memory, passes, tradeoffs, and salt modes (228 checks total).

## Read The Knobs As Constraints

Raise **Memory per hash** from `64 MiB` to `256 MiB`. The lab's defender latency
goes from about `105 ms` to about `318 ms`, and the attacker's modeled hash
evaluation rate drops by roughly 4x. That is the trade: the honest server spends
more memory and latency so the leaked-table attacker gets fewer resident guesses
and less bandwidth headroom.

Now set **Memory tradeoff** to `1/4 memory`. The attacker gets four times as
many resident slots, but the toy recomputation penalty is larger than that slot
gain, so the total modeled evaluation rate falls. This is the intuition memory
hardness is trying to buy. It is not a proof about the real scheme.

Finally change **Salt model** to `shared salt`. The one-target line does not
move. The breach-wide line collapses, because one candidate password can be
tested against every account after one KDF evaluation. That is why salt
uniqueness is table hygiene, not only cryptographic decoration.

## What The Lab Leaves Out

The lab does not model GPUs, ASICs, cache hierarchy, library implementation
details, side channels, or actual Argon2 indexing. The constants are knobs in a
toy economy, not published benchmark numbers.

It also does not decide whether a password is good. A 40-bit search space in
the plot is a simplified entropy ledger, not a statement about human password
choice. Real password systems need blocklists for common and compromised
passwords, online rate limiting, phishing-resistant recovery paths, MFA where
appropriate, and careful handling of password managers and Unicode input. NIST's
password section is explicit about blocklists, rate limiting, full-password
verification, and authenticated protected channels.[^nist]

The password hash is the part that keeps working after the online controls have
been bypassed by a table leak. It is necessary, not sufficient.

## Evidence, Interpretation, Speculation

**Evidence.** NIST SP 800-63B requires salted, offline-resistant password
storage and says cost factors should be as high as practical without hurting
verifier performance. RFC 9106 describes Argon2 inputs, operation, Argon2id, and
recommended parameter sets. RFC 7914 explains scrypt's motivation in custom
hardware economics.

**Interpretation.** The right mental model is budget accounting. A verifier cost
is a production SLO for the defender and a search tax for the attacker. Memory
is useful because it changes how many guesses can be parallelized under a fixed
hardware budget.

**Speculation.** Many weak deployments survive because the password hash is
reviewed like a library choice instead of a capacity plan. I would rather see a
short table with measured p50/p95 login latency, memory pressure under burst,
stored parameter strings, and rehash migration policy than a bare claim that
"we use Argon2."

## Deployment Checklist

For a production password verifier, I want these questions answered:

1. Which scheme and exact parameter string is stored with each password?
2. What are p50, p95, and overload login latencies on production-shaped
   hardware?
3. How much memory is reserved for authentication under peak login and recovery
   traffic?
4. Are salts randomly generated, unique in practice, and stored per password?
5. Is there a server-side secret pepper or keyed post-processing step, and where
   is that key isolated?
6. What triggers rehashing to newer parameters?
7. Does account recovery meet at least the same offline-resistance standard?
8. Are chosen passwords checked against common, expected, and compromised
   password blocklists?

A password hash rents memory so an attacker has to rent it too. The invoice
should be visible before the breach, not discovered afterward.

[^nist]: NIST, [SP 800-63B, Authentication and Lifecycle Management](https://pages.nist.gov/800-63-4/sp800-63b.html), SP 800-63-4, August 2025. As consulted on June 18, 2026, Section 3.1.1.2 says verifiers shall store passwords in a form resistant to offline attacks, use salted password hashing schemes with a cost factor, choose the cost factor as high as practical without hurting verifier performance, use salts of at least 32 bits chosen to minimize collisions, store the salt and hash per password, and store password-hashing scheme references and cost factors to support migration.

[^argon2-inputs]: Alex Biryukov, Daniel Dinu, Dmitry Khovratovich, and Simon Josefsson, [RFC 9106, "Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications"](https://datatracker.ietf.org/doc/html/rfc9106), September 2021. Section 3.1 defines Argon2 inputs, including password, salt, degree of parallelism, memory size, number of passes, optional secret value, and type; it recommends 16-byte salts for password hashing and says salts should be unique for each password.

[^scrypt]: Colin Percival and Simon Josefsson, [RFC 7914, "The scrypt Password-Based Key Derivation Function"](https://datatracker.ietf.org/doc/html/rfc7914), August 2016. The introduction explains why iteration-only schemes lose ground against custom parallel hardware and frames brute-force password search in dollar-seconds; Section 2 describes scrypt parameters `N`, `r`, and `p`.

[^argon2-rec]: RFC 9106, Section 7.4, ["Recommendations"](https://datatracker.ietf.org/doc/html/rfc9106#section-7.4). It names Argon2id with `t=1`, `p=4`, `m=2^21` KiB, 128-bit salt, and 256-bit tag as the first recommended option, and Argon2id with `t=3`, `p=4`, `m=2^16` KiB, 128-bit salt, and 256-bit tag as the second recommended option for memory-constrained environments.

[^argon2-tradeoff]: RFC 9106, Section 7.2, ["Security against Time-Space Trade-off Attacks"](https://datatracker.ietf.org/doc/html/rfc9106#section-7.2), discusses attacks that store fewer memory blocks and recompute missing blocks, measuring advantage through time-area product. The same section references the Argon2 paper: Biryukov, Dinu, and Khovratovich, ["Argon2: the memory-hard function for password hashing and other applications"](https://www.cryptolux.org/images/0/0d/Argon2.pdf), 2017.
