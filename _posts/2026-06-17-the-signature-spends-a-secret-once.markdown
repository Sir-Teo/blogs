---
layout: post
title: "The Signature Spends a Secret Once"
description: "In DSA-style signatures, the per-message nonce is not harmless randomness. Reuse it, shrink it, or put it on a clock, and the private key turns into linear algebra."
date: 2026-06-17 00:46:00 -0400
categories: computer-science
tags: [ecdsa, dsa, signatures, nonces, cryptography, security, modular-arithmetic, blockchains]
excerpt: "A signature can reveal the private key without breaking the curve. Sometimes the only broken part is the little secret spent during signing."
---

The public signature is allowed to travel.

The private key is not.

Between them sits a smaller secret that people keep underestimating:

```text
the per-message nonce
```

In DSA and ECDSA, signing a message spends a fresh secret value, traditionally
called \(k\). The verifier does not learn \(k\). The signature does not print
\(k\). But the signature equation contains \(k\) in exactly the place where a
bad implementation can turn one public artifact into a private-key leak.

For ECDSA, with private key \(x\), message hash \(e\), public signature
\((r,s)\), and group order \(n\), the important line is:

$$
s \equiv k^{-1}(e + rx) \pmod n.
$$

That is the whole trap.

The curve can be strong. The hash can be strong. The verifier can be correct.
If \(k\) repeats or becomes predictable, the private key walks out through the
side door.

## The Standard Knows This

FIPS 186-5 is blunt about ECDSA's per-message secret. Before each ECDSA
signature, a new secret random number \(k\) is required, and that value has to be
protected from disclosure and modification.[^fips] The standard also approves
deterministic ECDSA via RFC 6979, which replaces the "please have good entropy
every time" requirement with a specified HMAC-DRBG construction keyed by the
private key and message.[^rfc6979]

The point is not that randomness is bad. The point is that this randomness is
part of the private key's boundary.

If \(k\) is reused in two signatures with the same private key, the private key
is no longer hiding behind elliptic-curve hardness. It is hiding behind a
subtraction.

Start with two signatures:

$$
s_1 \equiv k^{-1}(e_1 + rx) \pmod n
$$

$$
s_2 \equiv k^{-1}(e_2 + rx) \pmod n.
$$

Subtract:

$$
s_1 - s_2 \equiv k^{-1}(e_1-e_2) \pmod n.
$$

So:

$$
k \equiv (e_1-e_2)(s_1-s_2)^{-1} \pmod n.
$$

Then:

$$
x \equiv (s_1k-e_1)r^{-1} \pmod n.
$$

One reuse. Complete compromise.

## A Toy Signature Lab

The browser lab below is not production ECDSA. It uses the same vulnerable
signature equation over a small prime field:

```text
s * k = h + r * x mod q
```

The public value `r` is derived from the hidden nonce as `r = g^k mod q`, which
makes it a visible fingerprint of the nonce. Real DSA and ECDSA compute `r`
with their actual group operation. The algebraic failure is the same shape.

The lab deliberately reveals the hidden `k` values in the table so the
experiment can be audited. A real verifier would not see them.

<style>
  .nonce-lab {
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

  .nonce-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .nonce-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .nonce-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .nonce-lab input,
  .nonce-lab select {
    font: inherit;
    min-height: 2rem;
    width: 100%;
  }

  .nonce-lab select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.2rem 0.45rem;
  }

  .nonce-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .nonce-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .nonce-lab__metric.good {
    border-color: #9ed8c5;
  }

  .nonce-lab__metric.bad {
    border-color: #f0b7b7;
  }

  .nonce-lab__metric span,
  .nonce-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .nonce-lab__metric span {
    display: block;
  }

  .nonce-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .nonce-lab canvas {
    background: #ffffff;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .nonce-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .nonce-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .nonce-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .nonce-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 540px) {
    .nonce-lab {
      padding: 0.75rem;
    }

    .nonce-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="signature-nonce-lab" class="nonce-lab" data-signature-nonce-lab>
  <div class="nonce-lab__controls">
    <label>
      Nonce failure: <output data-value="mode">reused nonce</output>
      <select data-param="mode">
        <option value="reuse" selected>reused nonce</option>
        <option value="small">tiny nonce space</option>
        <option value="linear">linear clock</option>
        <option value="fresh">fresh nonces</option>
      </select>
    </label>
    <label>
      Signatures: <output data-value="signatures">5</output>
      <input type="range" min="2" max="8" step="1" value="5" data-param="signatures">
    </label>
    <label>
      Tiny-space bits: <output data-value="bits">8</output>
      <input type="range" min="4" max="12" step="1" value="8" data-param="bits">
    </label>
    <label>
      Linear step: <output data-value="step">137</output>
      <input type="range" min="1" max="997" step="1" value="137" data-param="step">
    </label>
  </div>
  <div class="nonce-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="Signature nonce lab showing hidden nonce traces, public signature rows, key recovery formulas, and search validation"></canvas>
  <div class="nonce-lab__legend">
    <span><i style="background:#2563eb"></i> nonce trace</span>
    <span><i style="background:#be123c"></i> repeated or compromised</span>
    <span><i style="background:#0f766e"></i> verified recovery</span>
    <span><i style="background:#d97706"></i> hidden nonce values</span>
    <span><i style="background:#7c3aed"></i> linear relation</span>
  </div>
  <p class="nonce-lab__note">
    Deterministic toy signature experiment over q = 65537. The Node audit runs
    1,148 checks: field arithmetic, signature equations, repeated-r recovery,
    tiny-nonce dictionary hits, linear-system recovery, fresh-nonce controls,
    and parameter sanitization.
  </p>
</div>
<script defer src="{{ '/assets/js/signature-nonce-lab.js?v=20260617b' | relative_url }}"></script>

Try four modes.

**Reused nonce** is the classic catastrophe. The `r` column repeats because the
same hidden `k` was spent twice. The lab subtracts two signature equations,
recovers `k`, then recovers the private key `x`.

**Tiny nonce space** is an offline dictionary. The attacker tries every possible
small `k`, recomputes `r = g^k mod q`, and when `r` matches a public signature,
solves for `x`. If your nonce has only eight bits of entropy, one signature is
already enough in this toy.

**Linear clock** is more subtle. The `r` values do not repeat, and the nonces
are not small. But if the signer uses a known relation

```text
k_i = k0 + i * step
```

then each signature is a linear equation in the two unknowns `x` and `k0`.
Two signatures solve the system.

**Fresh nonces** is the control. The tiny dictionary is still tried, but it does
not hit the public `r` values, so the private key is not recovered by this
attack model.

## Partial Leaks Are Not Comforting

The lab's tiny-space mode is intentionally crude. Real failures are often
messier: a timing leak reveals a few bits, a biased generator avoids part of the
range, a process counter mixes into `k`, or a signing path uses related nonces
under latency pressure.

That messier world has been studied for decades. Howgrave-Graham and Smart
described lattice attacks on DSA when a portion of the ephemeral signing keys is
known.[^hgs] Nguyen and Shparlinski later gave provable recovery results for
DSA with a few consecutive bits of the nonces known, and extended the story to
ECDSA variants.[^nguyen-dsa][^nguyen-ecdsa]

The pattern is always the same:

```text
signature equation + structure in k = equations about x
```

The attacker does not have to solve the discrete logarithm problem. The signer
has accidentally replaced it with a smaller problem.

## The Blockchain Version Is Especially Unforgiving

Blockchain signatures are public, indexed, permanent, and attached to assets.
That makes nonce discipline more than an implementation detail. It becomes a
forensic surface.

A 2026 arXiv preprint on Polygon MEV searchers reports systematic ECDSA nonce
reuse and related nonce patterns in latency-sensitive workflows. The authors
write the same core equation as a linear system and describe same-wallet reuse,
linear nonce relations, and cross-wallet nonce collisions.[^polygon] I would
treat the paper as a preprint, not a final industry census. But the lesson does
not depend on one ecosystem: public signatures make repeated `r` values and
structured nonces auditably dangerous.

Once a key leaks on-chain, "rotate later" may only protect the next funds.

## A Signing Checklist

The defensive checklist is short and not glamorous:

```text
use a reviewed signing library
use RFC 6979 or a well-audited deterministic/hedged construction when available
never improvise k from timestamps, counters, UUIDs, or hashes of convenient fields
monitor emitted signatures for repeated r values
test signer state across process restarts, forks, VMs, HSM failover, and load spikes
treat nonce precomputation with the same confidentiality as the private key
rotate immediately after any nonce anomaly
```

FIPS 186-5 says that precomputed \(k\) and \(k^{-1}\) have to be protected like
the private key.[^fips] That is the right mental model.

The nonce is not metadata.

It is a one-use private key fragment.

[^fips]: NIST, ["FIPS 186-5: Digital Signature Standard (DSS)"](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-5.pdf), 2023. Section 6.3 requires a new protected per-message secret number for ECDSA; Section 6.4 gives the ECDSA signature-generation equation.

[^rfc6979]: Thomas Pornin, ["Deterministic Usage of the Digital Signature Algorithm (DSA) and Elliptic Curve Digital Signature Algorithm (ECDSA)"](https://datatracker.ietf.org/doc/html/rfc6979), RFC 6979, 2013.

[^hgs]: Nick Howgrave-Graham and Nigel P. Smart, ["Lattice Attacks on Digital Signature Schemes"](https://research-information.bris.ac.uk/en/publications/lattice-attacks-on-digital-signature-schemes/), *Designs, Codes and Cryptography* 23(3):283-290, 2001.

[^nguyen-dsa]: Phong Q. Nguyen and Igor E. Shparlinski, ["The Insecurity of the Digital Signature Algorithm with Partially Known Nonces"](https://link.springer.com/article/10.1007/s00145-002-0021-3), *Journal of Cryptology* 15:151-176, 2002.

[^nguyen-ecdsa]: Phong Q. Nguyen and Igor E. Shparlinski, ["The Insecurity of the Elliptic Curve Digital Signature Algorithm with Partially Known Nonces"](https://www.di.ens.fr/~pnguyen/pub_NgSh02.htm), *Designs, Codes and Cryptography* 30(2):201-217, 2003.

[^polygon]: Yash Madhwal, Andrey Seoev, Raffaele Della Pietra, Anastasiia Smirnova, and Yury Yanovich, ["Chain Reactions: How Nonce Collisions in ECDSA Compromise Polygon MEV Searchers"](https://arxiv.org/abs/2605.21498), arXiv:2605.21498, 2026.
