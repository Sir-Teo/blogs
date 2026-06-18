---
layout: post
title: "The Nonce Has One Job"
description: "AES-GCM is fast because each nonce/key pair creates a one-time encryption stream and a one-time authentication mask. Reuse the nonce and both contracts overlap."
date: 2026-06-18 00:44:00 -0400
categories: computer-science
tags: [aes-gcm, aead, cryptography, nonce-reuse, authenticated-encryption, security]
excerpt: "A GCM nonce is not decorative randomness. Under a fixed key, it is the label that keeps two one-time mechanisms from being used twice."
---

Authenticated encryption is supposed to give two answers at once:

```text
keep the bytes secret
reject modified bytes
```

GCM gets there by combining counter-mode encryption with a polynomial
authentication function called GHASH. That combination is fast and widely
deployed. It also puts a hard operational requirement on the nonce.

Under one key, a GCM nonce has one job:

```text
never name two different encryptions
```

## The Counter Stream Repeats

Counter-mode encryption turns a block cipher into a stream of pads:

```text
C[i] = P[i] xor pad(key, nonce, counter+i)
```

If the same key and nonce are reused, the pad repeats. For two ciphertexts:

$$
C_1 = P_1 \oplus S
$$

$$
C_2 = P_2 \oplus S
$$

Xor them:

$$
C_1 \oplus C_2
=
P_1 \oplus P_2.
$$

The stream has disappeared from the equation. If one plaintext is known or
guessable, the other plaintext is exposed byte for byte:

$$
P_2 = C_1 \oplus C_2 \oplus P_1.
$$

This is the same failure as a reused one-time pad. GCM's authentication layer
does not repair it; the authentication layer has its own nonce-reuse problem.

## The Authentication Mask Repeats Too

GCM's tag has the shape:

```text
tag = encrypted_nonce_block xor GHASH_H(aad, ciphertext)
```

The details matter in real GCM: GHASH works in $$\mathrm{GF}(2^{128})$$, uses a
hash subkey $$H=E_K(0^{128})$$, includes associated data, includes ciphertext,
and includes lengths. The structural point is enough for the failure:

```text
same key + same nonce -> same encrypted_nonce_block
```

So repeated nonces do not merely reveal a plaintext xor. They also give an
attacker equations in the authentication polynomial.

NIST SP 800-38D states the uniqueness requirement directly: for GCM, IVs must
not repeat with the same key except with negligible allowed probability, and
compliance is crucial to security.[^nist] Appendix A explains the reason: if
IVs repeat, an adversary may determine the hash subkey and construct
forgeries.[^nist-appendix] RFC 5116 says the same thing in operational language:
GCM nonce reuse undermines confidentiality and all authenticity/integrity for
that key; observing two distinct plaintext encryptions with the same nonce lets
an attacker reconstruct the xor of the plaintexts and recover the internal hash
key used for integrity.[^rfc5116]

That is stronger than:

```text
do not repeat nonces because it is untidy
```

It is:

```text
do not repeat nonces because the construction has one-time parts
```

## Lab: A Tiny GCM-Shaped Failure

The lab below is not AES-GCM. It uses:

- byte-sized finite-field arithmetic instead of $$\mathrm{GF}(2^{128})$$;
- a deterministic pseudo-keystream instead of AES;
- a one-byte GHASH recovery example so the algebra fits on the page.

The toy is intentionally small enough to audit. It demonstrates the two
separate failures under one repeated nonce:

1. `C1 xor C2 = P1 xor P2`.
2. A repeated tag mask gives equations that recover the toy GHASH key and allow
   a valid forged tag.

With the default settings:

```text
P1: pay=1000;to=alice;ok=yes
P2: pay=9000;to=admin;ok=yes
nonce: 7
seed: 41
```

the lab measures:

| Quantity | Value |
| --- | --- |
| message bytes | 24 |
| `C1 xor C2` | `00 00 00 00 08 00 00 00 00 00 00 00 00 08 04 0a 0b 00 00 00 00 00 00 00` |
| recovered `P2` from `P1` | `pay=9000;to=admin;ok=yes` |
| secret toy `H` | `0x2b` |
| recovered toy `H` | `0x2b` |
| secret toy mask `S` | `0xb3` |
| recovered toy mask `S` | `0xb3` |
| forged plaintext byte | `!` |
| forged tag | `0x0f` |

The recovered `H` is not an implementation accident. In the one-byte toy
GHASH:

$$
T = S \oplus (C \cdot H).
$$

For two chosen one-byte encryptions under the same nonce:

$$
T_a \oplus T_b
=
(C_a \oplus C_b) \cdot H.
$$

So:

$$
H =
(T_a \oplus T_b) / (C_a \oplus C_b).
$$

Real GCM uses a much larger field and a fuller polynomial, but RFC 5116 and
NIST's appendix are warning about the same kind of break: repeated nonces expose
authentication structure that was meant to be one-time.

<style>
  .gcm-lab {
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

  .gcm-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .gcm-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .gcm-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .gcm-lab input,
  .gcm-lab select {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .gcm-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.1rem;
    padding: 0.25rem 0.45rem;
  }

  .gcm-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .gcm-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .gcm-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .gcm-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .gcm-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .gcm-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.8rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .gcm-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .gcm-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="gcm-lab" data-gcm-nonce-lab>
  <div class="gcm-lab__controls">
    <label>
      Scenario
      <select data-param="scenario" aria-label="Message scenario">
        <option value="payment" selected>payment tokens</option>
        <option value="role">role claims</option>
        <option value="sensor">sensor frames</option>
      </select>
    </label>
    <label>
      Seed
      <output data-value="seed">41</output>
      <input type="range" min="1" max="9999" step="1" value="41" data-param="seed">
    </label>
    <label>
      Nonce
      <output data-value="nonce">7</output>
      <input type="range" min="0" max="255" step="1" value="7" data-param="nonce">
    </label>
    <label>
      Forged byte
      <output data-value="forgeByte">!</output>
      <input type="range" min="32" max="126" step="1" value="33" data-param="forgeByte">
    </label>
  </div>
  <div class="gcm-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive toy GCM nonce reuse lab showing xor leakage, known plaintext recovery, toy GHASH key recovery, and a forged tag"></canvas>
  <p class="gcm-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/gcm-nonce-lab.js?v=20260618c' | relative_url }}"></script>

## What the Audit Checks

The lab exports the same checks to Node. It verifies:

- the repeated nonce reuses the toy keystream prefix;
- a different nonce changes the toy keystream;
- `C1 xor C2` equals `P1 xor P2`;
- knowing `P1` recovers `P2`;
- the toy GHASH recovery finds the secret `H`;
- the toy mask recovery finds the secret `S`;
- the forged one-byte ciphertext verifies under the real toy decryptor;
- tampering with an old ciphertext while reusing its old tag fails.

The deterministic audit grid is:

| Scenario | Seed | Nonce | Bytes | Secret `H` | Recovered `H` | Forged byte |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| payment | 41 | 7 | 24 | 43 | 43 | 33 |
| role | 12 | 3 | 29 | 136 | 136 | 65 |
| sensor | 99 | 201 | 28 | 111 | 111 | 90 |
| payment | 123 | 0 | 24 | 244 | 244 | 36 |
| role | 777 | 255 | 29 | 60 | 60 | 126 |

Reproduce it from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/gcm-nonce-lab.js");
const audit = lab.auditGrid();
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  seed: row.seed,
  nonce: row.nonce,
  bytes: row.length,
  hashKey: row.hashKey,
  recoveredHashKey: row.recoveredHashKey,
  mask: row.mask,
  recoveredMask: row.recoveredMask,
  forgedByte: row.forgedByte,
  forgedTag: row.forgedTag,
  passed: row.passed
})));
console.table(audit.byScenario);
console.table(audit.criticalChecks);
if (audit.total !== 5 || audit.totalChecks !== 45) {
  throw new Error(`unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`);
}
if (!audit.ok || audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify(audit.errors, null, 2));
}
console.log(`${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

## What This Toy Leaves Out

This lab does not implement:

- AES;
- 128-bit blocks;
- real GHASH length encoding;
- associated data;
- tag truncation;
- side-channel behavior;
- multi-block key-recovery algebra.

Those omissions are deliberate. The post is about the contract, not a
production exploit. The real contract is stricter than the toy:

```text
unique nonce per key, across all encryptions
```

NIST also recommends restricting GCM IV support to 96-bit IVs for efficiency and
interoperability, while giving deterministic and random construction frameworks
for meeting the uniqueness requirement.[^nist] In March 2024, NIST announced
that SP 800-38D will be revised, including removal of support for tags shorter
than 96 bits and clarification of IV guidance.[^nist-revise]

If unique nonces cannot be provided with assurance, use a construction designed
for nonce misuse resistance. RFC 8452 specifies AES-GCM-SIV and says its goal is
not to fail catastrophically if a nonce repeats.[^rfc8452] That does not mean
nonce discipline stops mattering. It means the algorithm was designed around a
different misuse story.

The practical checklist is short:

- Make nonce allocation part of the protocol state, not an optional parameter.
- Partition nonce space across devices, processes, shards, and restarts.
- Persist counters far enough ahead that power loss cannot replay one.
- Rotate keys before counter space or security limits are approached.
- Treat one observed GCM nonce collision under a key as a key-compromise event,
  not as a single bad packet.

The nonce is small. The state machine around it is not.

[^nist]: Morris Dworkin, ["Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC"](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf), NIST SP 800-38D, 2007. Section 8 states the IV/key uniqueness requirement; Section 5 recommends 96-bit IVs.

[^nist-appendix]: NIST SP 800-38D, Appendix A, "Importance of the Uniqueness Requirement on IVs." The appendix summarizes the counter-mode confidentiality problem and the GHASH subkey/forgery consequence of repeated IVs.

[^rfc5116]: David McGrew, ["An Interface and Algorithms for Authenticated Encryption"](https://datatracker.ietf.org/doc/html/rfc5116), RFC 5116, 2008. Section 5.1.1 describes GCM nonce-reuse consequences.

[^rfc8452]: Shay Gueron, Adam Langley, and Yehuda Lindell, ["AES-GCM-SIV: Nonce Misuse-Resistant Authenticated Encryption"](https://datatracker.ietf.org/doc/html/rfc8452), RFC 8452, 2019.

[^nist-revise]: NIST, ["NIST to Revise Special Publication 800-38D"](https://csrc.nist.gov/news/2024/nist-to-revise-sp-80038d-gcm-and-gmac-modes), March 5, 2024.
