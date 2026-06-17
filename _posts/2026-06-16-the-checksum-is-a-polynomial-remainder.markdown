---
layout: post
title: "The Checksum Is a Polynomial Remainder"
description: "A CRC is not a small hash pasted onto a packet. It is polynomial division over GF(2), and an error is missed exactly when the error polynomial is divisible by the generator."
date: 2026-06-16 21:45:00 -0400
categories: computer-science
tags: [crc, checksums, coding-theory, error-detection, finite-fields, networking, storage-systems, software-engineering]
excerpt: "CRCs work because the receiver does not ask whether the checksum changed. It asks whether the whole corrupted codeword is still divisible by a generator polynomial."
---

A checksum sounds like arithmetic.

Add the bytes. Fold the carry. Compare the result.

A cyclic redundancy check is stranger. It treats the bit string as a polynomial,
divides by another polynomial, and appends the remainder.

No carries.

No base ten.

Just XOR.

That detail is not decorative. It is the reason CRCs are good at catching
bursts, why two polynomials with the same number of check bits can behave very
differently, and why the phrase "32-bit CRC" is incomplete unless it names the
generator and the rest of the parameter set. This is the cyclic-code view
Peterson and Brown put on firm footing in their 1961 paper on error-detection
codes.[^peterson-brown]

## The Packet As A Polynomial

Take a payload bit string:

```text
101101
```

Read it as a polynomial over $$GF(2)$$:

$$
x^5 + x^3 + x^2 + 1.
$$

The coefficients are bits. Addition is XOR. Subtraction is also XOR. There are
no carries between columns, which is why polynomial long division can be
implemented by a shift register and conditional XOR.

Choose a generator polynomial $$g(x)$$ of degree $$r$$. To encode a payload
$$m(x)$$:

1. multiply by $$x^r$$, which appends $$r$$ zero bits;
2. divide $$m(x)x^r$$ by $$g(x)$$;
3. append the $$r$$-bit remainder.

The transmitted codeword $$c(x)$$ is constructed so that:

$$
c(x) \equiv 0 \pmod{g(x)}.
$$

The receiver divides the received bits by the same generator. A nonzero
remainder is a syndrome: something changed.

The useful algebra is even shorter. Suppose the channel adds an error polynomial
$$e(x)$$. The receiver sees:

$$
r(x)=c(x)+e(x).
$$

Since $$c(x)$$ is divisible by $$g(x)$$, the syndrome is just:

$$
r(x) \bmod g(x)=e(x) \bmod g(x).
$$

So a CRC misses an error exactly when the error pattern itself is divisible by
the generator.

That is the whole machine.

## A CRC Lab

The lab below implements direct, MSB-first polynomial division over $$GF(2)$$.
It builds a systematic codeword, flips selected bits, computes the syndrome,
and exhaustively counts missed single-bit, double-bit, and short burst errors
for the current codeword length.

The default uses `CRC-8/ATM`, generator `0x107` in explicit form
($$x^8+x^2+x+1$$). The payload is 96 bits and the CRC is 8 bits, so the codeword
is 104 bits. The computed check byte is `0x34`. The selected 7-bit burst is
detected with syndrome `0x62`. There are zero single-bit misses and zero
double-bit misses at this length. The lab counts `751` missed bursts among all
burst patterns of length up to 12; those misses occur beyond the 8-bit burst
guarantee.

<style>
  .crc-lab {
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

  .crc-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .crc-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .crc-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .crc-lab input,
  .crc-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .crc-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }

  .crc-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    margin: 0.8rem 0 0.9rem;
  }

  .crc-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }

  .crc-lab__metric span,
  .crc-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .crc-lab__metric span {
    display: block;
  }

  .crc-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .crc-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .crc-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="crc-polynomial-lab" class="crc-lab" data-crc-polynomial-lab>
  <div class="crc-lab__controls">
    <label>
      Generator
      <select data-param="poly">
        <option value="crc8" selected>CRC-8/ATM 0x07</option>
        <option value="bad8">bad CRC-8 x^8+1</option>
        <option value="crc16ccitt">CRC-16/CCITT 0x1021</option>
        <option value="crc16ibm">CRC-16/IBM 0x8005</option>
        <option value="parity">parity x+1</option>
      </select>
    </label>
    <label>
      Payload: <output data-value="length">96 bits</output>
      <input type="range" min="32" max="192" step="8" value="96" data-param="length">
    </label>
    <label>
      Error pattern
      <select data-param="errorMode">
        <option value="burst" selected>contiguous burst</option>
        <option value="single">single bit</option>
        <option value="double">two bits</option>
        <option value="random">random flips</option>
      </select>
    </label>
    <label>
      Error start: <output data-value="start">bit 38</output>
      <input type="range" min="0" max="103" step="1" value="38" data-param="start">
    </label>
    <label>
      Burst / gap: <output data-value="burst">7 bits</output>
      <input type="range" min="1" max="24" step="1" value="7" data-param="burst">
    </label>
    <label>
      Random flips: <output data-value="flips">4 flips</output>
      <input type="range" min="1" max="16" step="1" value="4" data-param="flips">
    </label>
    <label>
      Seed: <output data-value="seed">29</output>
      <input type="range" min="1" max="997" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="crc-lab__metrics" data-metrics></div>
  <canvas data-canvas width="920" height="700" aria-label="CRC polynomial lab showing codeword bits, polynomial division trace, detected and undetected error counts, and polynomial comparison"></canvas>
  <p class="crc-lab__note">
    Deterministic browser experiment. The lab uses a direct systematic CRC
    model without reflection, initial register presets, or final xor; production
    CRC names also specify those parameters.
  </p>
</div>
<script defer src="{{ '/assets/js/crc-polynomial-lab.js?v=20260616a' | relative_url }}"></script>

Switch the generator to **parity**. Every two-bit error is missed. Parity only
knows whether the number of flipped bits is odd.

Switch to **bad CRC-8 x^8+1**. It has the same check width as CRC-8/ATM, but at
the default length it misses `624` double-bit patterns. The number of check bits
did not change. The polynomial did.

Switch to a 16-bit polynomial. For this short payload and the lab's tested
bursts up to length 12, the miss count drops to zero. That is not a universal
claim about every possible long message. It is a statement about this generator,
this length, and this tested error set.

That conditioning is the habit CRCs demand.

## Why Bursts Are Special

A burst error of length $$b$$ has first and last coefficients equal to 1 and
degree $$b-1$$. If $$b \le r$$, then the error polynomial has degree less than
the generator degree $$r$$. A nonzero lower-degree polynomial cannot be a
multiple of $$g(x)$$.

So a degree-$$r$$ CRC detects every burst of length at most $$r$$, assuming the
generator has the usual nonzero leading and constant terms.

Longer bursts are different. Some longer error polynomials are multiples of the
generator. Those are the missed cases. For random-looking longer bursts, the
miss probability is often roughly on the order of $$2^{-r}$$, but the word
"often" is doing work. The exact answer depends on the polynomial, message
length, and error model.

RFC 3385 makes this engineering point directly for iSCSI: undetected-error
probability depends on the selected polynomial, the error distribution, and the
data length.[^rfc3385]

The lab is built around that sentence.

## Hamming Distance Is A Length-Dependent Claim

When Koopman and Chakravarty studied CRC polynomial selection for embedded
networks, they emphasized Hamming distance as the minimum number of bit
inversions needed to create an undetected error for a given data length.[^koopman]
That phrase "for a given data length" is not bookkeeping. It is the thing.

A polynomial can be excellent for short packets and less impressive for longer
ones. Another can have the same width but a better minimum distance over the
message sizes you actually send. Koopman's tables of "best" polynomials are
organized by check width, Hamming distance, and maximum dataword length rather
than by width alone.[^koopman-tables]

This is why a protocol review should not stop at:

```text
we use CRC-16
```

It should ask:

```text
which CRC-16?
how long are the protected words?
what error model matters?
what undetected-error rate
is acceptable?
```

The lab's polynomial comparison panel is a miniature version of that review.
It is not searching the full design space. It is showing that the design space
exists.

## The Parameter Trap

Real CRC names carry more than a polynomial.

They may specify:

- width;
- polynomial;
- initial register value;
- reflected input;
- reflected output;
- final xor;
- check value for a standard test string.

Ross Williams' "Rocksoft Model" became a common way to describe these
parameters precisely, and the CRC RevEng catalogue uses that model to list
attested CRC algorithms.[^williams-reveng]

The lab avoids that complexity on purpose. It uses a direct systematic
MSB-first model:

```text
payload || remainder
```

That is enough to show the algebra. It is not enough to reproduce every named
industrial CRC. If two libraries disagree on reflection or initialization, they
can both be "using CRC-16" and still produce different check values.

In production, the test string matters. The arithmetic is small enough that
ambiguity should be illegal.

## Detection Is Not Correction

The Hamming-code post in this notebook was about locating a small error. The
Reed-Solomon post was about reconstructing missing shards when their positions
are known.

A CRC usually does neither.

It says:

```text
this received word is not divisible
by the generator
```

That is detection. The normal response is to drop the packet, retry the block,
fail the frame, or escalate to a stronger recovery mechanism. There are CRCs
used in correction-oriented schemes, but the everyday network/storage CRC is
mostly a guardrail, not a repair shop.[^crc-zoo]

That distinction is healthy. A detector can be cheap, fast, and very good at
rejecting accidental corruption without pretending it can heal the data.

## The Receipt

Before I trust a CRC choice, I want a small receipt:

1. the full parameter set, not just the width;
2. the protected word length distribution;
3. the expected fault model: random independent flips, bursts, stuck bits,
   reordered bytes, all-zero failures, DMA truncation, or something else;
4. guaranteed Hamming distance over the relevant lengths;
5. burst detection guarantees;
6. implementation test vectors;
7. what happens after detection.

The last item is easy to forget. Detection is only useful if the system has a
safe next move.

The checksum is not a charm. It is a remainder.

And the remainder is a question:

```text
is this corruption one of
the polynomials my generator
cannot see?
```

Good engineering starts by making that question explicit.

## Paper Trail

[^peterson-brown]: W. Wesley Peterson and D. T. Brown, ["Cyclic Codes for Error Detection"](https://doi.org/10.1109/JRPROC.1961.287814), *Proceedings of the IRE*, 49(1), 1961. The Error Correction Zoo entry for [CRC codes](https://errorcorrectionzoo.org/c/crc) lists the paper as the original CRC-code reference.

[^koopman]: Philip Koopman and Tridib Chakravarty, ["Cyclic Redundancy Code (CRC) Polynomial Selection For Embedded Networks"](https://users.ece.cmu.edu/~koopman/roses/dsn04/koopman04_crc_poly_embedded.pdf), DSN 2004.

[^rfc3385]: Sheinwald et al., ["Internet Protocol Small Computer System Interface (iSCSI) Cyclic Redundancy Check (CRC)/Checksum Considerations"](https://datatracker.ietf.org/doc/rfc3385/), RFC 3385, 2002.

[^koopman-tables]: Philip Koopman, ["Best CRC Polynomials"](https://users.ece.cmu.edu/~koopman/crc/), Carnegie Mellon University. The tables organize polynomial choices by width, Hamming distance, and maximum dataword length.

[^williams-reveng]: Ross N. Williams, "A Painless Guide to CRC Error Detection Algorithms," 1993. The [CRC RevEng catalogue](https://reveng.sourceforge.io/crc-catalogue/) describes its parameterized algorithms as using Williams' Rocksoft Model and provides attested CRC parameter sets.

[^crc-zoo]: Error Correction Zoo, ["Cyclic redundancy check (CRC) code"](https://errorcorrectionzoo.org/c/crc), including hierarchy and references for CRCs as checksum/cyclic linear binary codes.
