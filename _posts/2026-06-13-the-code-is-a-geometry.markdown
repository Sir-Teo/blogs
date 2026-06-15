---
layout: post
title: "Reliable Bits Need Empty Space"
description: "Error correction is not a spell that makes bits reliable. It is a geometric bargain: spend redundancy to move valid messages farther apart."
date: 2026-06-13 20:08:00 -0400
categories: computer-science
tags: [error-correcting-codes, hamming-code, information-theory, shannon, parity-checks, coding-theory]
excerpt: "A Hamming code turns four data bits into a point in a seven-dimensional cube, then uses parity checks to find the nearest valid point after noise."
---

A noisy bit does not apologize.

It flips, and the receiver sees another perfectly legal bit. The channel does
not attach a note saying, "this one changed."

Error correction works by refusing to use all possible bit strings as messages.
It spends redundancy to leave empty space around valid messages. When noise
moves a received word into that empty space, the decoder can often infer which
valid word was nearby.

That is the core idea:

```text
reliability is bought by spacing codewords apart
```

The code is a geometry.

## Bits Live on a Cube

An $$n$$-bit word is a vertex of an $$n$$-dimensional cube. Two words are close
if they differ in few positions. That distance is now called Hamming distance.

Hamming's 1950 paper explicitly uses this geometric model, identifying binary
sequences with vertices of a unit $$n$$-dimensional cube.[^hamming] A code is a
selected subset of those vertices. The minimum distance of the code is the
smallest distance between any two selected vertices.

If two codewords are distance 3 apart, then a single-bit error cannot turn one
valid word into another valid word. It lands in a neighboring non-codeword. A
nearest-neighbor decoder can move it back.

If two bits flip, the received word may be closer to the wrong codeword, or may
look like a single-bit error somewhere else. Distance 3 buys guaranteed
single-error correction. It does not buy arbitrary miracles.

## Seven Bits With an Address Book

The $$(7,4)$$ Hamming code stores four data bits in seven transmitted bits.
Positions 1, 2, and 4 are parity checks. Positions 3, 5, 6, and 7 carry data.

The parity checks are arranged so that every bit position has a unique binary
address:

```text
position: 1 2 3 4 5 6 7
address:  1 2 3 4 5 6 7
```

After receiving seven bits, recompute the three parity checks. The failed
checks form a three-bit syndrome. If the syndrome is 5, flip bit 5. If the
syndrome is 0, accept the word.

This is a beautiful little trick. The syndrome is not merely a flag saying
"something is wrong." It is an address.

The price is rate:

$$
\text{rate} = \frac{4}{7}.
$$

Four information bits consume seven channel uses. The code is less efficient
than raw transmission on a perfect channel and far more reliable on a moderately
noisy one.

## A Noisy Channel on the Table

The lab below compares four schemes on a binary symmetric channel, where every
transmitted bit independently flips with probability $$p$$.

- **raw** sends the four payload bits directly;
- **Hamming(7,4)** corrects one flipped bit in the seven-bit block;
- **SECDED(8,4)** adds one overall parity bit, so it can correct one error and
  detect every two-bit error;
- **repeat-3** sends each payload bit three times and decodes by majority vote.

The outcome probabilities are exact sums over all error masks, not Monte Carlo.
The one-word panel lets you choose a payload and a seven-bit error mask to see
the Hamming syndrome directly.

<style>
  .hamming-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .hamming-lab__controls {
    display: grid;
    gap: 0.9rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(188px, 1fr));
  }

  .hamming-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hamming-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .hamming-lab__controls input {
    accent-color: #2563eb;
    width: 100%;
  }

  .hamming-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .hamming-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .hamming-lab__metric span,
  .hamming-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .hamming-lab__metric span {
    display: block;
  }

  .hamming-lab__metric strong {
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .hamming-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hamming-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div id="hamming-code-lab" class="hamming-lab" data-hamming-lab>
  <div class="hamming-lab__controls">
    <label>
      Bit flip probability: <output data-value="p">3.0%</output>
      <input type="range" min="0" max="20" step="0.5" value="3" data-param="p">
    </label>
    <label>
      Payload word: <output data-value="data">1011</output>
      <input type="range" min="0" max="15" step="1" value="11" data-param="data">
    </label>
    <label>
      Error mask: <output data-value="mask">0000011</output>
      <input type="range" min="0" max="127" step="1" value="3" data-param="mask">
    </label>
    <label>
      Sweep max: <output data-value="sweepMax">12%</output>
      <input type="range" min="2" max="30" step="1" value="12" data-param="sweepMax">
    </label>
  </div>
  <div class="hamming-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Hamming code simulator showing syndrome decoding, block outcomes, noise sweep, and coding rate ledger"></canvas>
  <p class="hamming-lab__note">
    Exact binary symmetric channel calculation over all error masks. Success
    means the decoded payload equals the transmitted payload. Wrong means the
    decoder accepts an incorrect payload. Erasure means SECDED detected an
    uncorrectable pattern and refused to deliver a payload. The script also
    runs a deterministic audit over the finite toy code before reporting its
    check count.
  </p>
</div>
<script defer src="{{ '/assets/js/hamming-code-lab.js?v=20260615a' | relative_url }}"></script>

At $$p=3\%$$, raw four-bit transmission has about an 11.5% block error rate:
one or more payload bits flipped. Hamming(7,4) is much better because all
single-bit errors in the seven-bit block are corrected. Its wrong-accepted rate
is 1.71%, mostly from two or more flips.

SECDED adds an eighth parity bit. It slightly reduces delivered success because
some corrupted blocks become erasures, but it sharply reduces wrong accepted
payloads: at the same 3% bit-flip rate, the lab reports 0.13% silent wrong
payloads and 2.10% detected erasures. That is often the right bargain. In
memory systems, storage, and transport protocols, "I know this block is bad" can
be much safer than a quiet wrong answer.

Repeat-3 does well at low bit error rates, but it spends twelve transmitted bits
to send four payload bits. Its rate is $$1/3$$, versus $$4/7$$ for Hamming.
Reliability is never free. The question is which reliability you bought per
channel use.

## Detection Is Not Correction

Single parity detects any odd number of bit flips. It cannot tell you where the
error happened.

Hamming parity checks do more. They are arranged so that each bit participates
in a unique pattern of checks. A single flipped bit therefore leaves a unique
syndrome. The decoder can correct it.

But correction and detection are different promises:

```text
detection says "this is not a codeword"
correction says "this is probably that codeword"
```

The unextended $$(7,4)$$ Hamming code corrects every one-bit error, but two-bit
errors can masquerade as one-bit errors. The decoder flips a third bit and may
deliver the wrong payload.

Adding the eighth parity bit changes the geometry. The extended code has
minimum distance 4. It can still correct one error, and now every two-bit error
is detected rather than silently "corrected" into nonsense.

That is why the lab separates **wrong** from **erasure**. A low error rate is
not enough. The kind of error matters.

Because this example is small, the implementation does not need sampling faith.
Its exported `runAudit()` checks the finite state space directly: all 16 clean
payload round trips for each scheme, every one-bit Hamming and SECDED correction
case, every two-bit SECDED detection case, the Hamming two-bit miscorrection
failure mode, the minimum distances 3 and 4, and probability-mass conservation
for several channel settings. The visible `1113/1113` audit counter is not a
claim about every physical channel. It is a promise that the model on the page
matches the theorem on the page.

## Shannon Promised Existence, Not a Circuit

Two years before Hamming's paper, Shannon framed communication as reproducing a
message selected at one point at another point, with noise and uncertainty made
mathematical.[^shannon] His noisy-channel coding theorem says, roughly, that
below channel capacity there exist codes whose error probability can be driven
arbitrarily low with long enough blocks.

That theorem is astonishing. It is also existential. It does not hand you a
cheap encoder, a decoder, latency bounds, or a convenient circuit.

Hamming(7,4) lives at the other end of the story: tiny, explicit, mechanical,
and easy to decode. It is not capacity-achieving. It is a working geometry.

The modern coding-theory arc is the attempt to keep Shannon's promise while
making decoding computationally plausible.

Gallager's low-density parity-check codes were a major step in that direction:
represent the code by a sparse parity-check matrix, so each check touches only a
small number of bits.[^gallager] Sparse checks make iterative decoding possible
at long block lengths. Decades later, MacKay and Neal helped revive LDPC codes
by showing near-Shannon-limit empirical performance with sparse matrices.[^mackay]

The same idea is visible in miniature in Hamming(7,4). A syndrome is a small set
of parity-check failures. Modern sparse-graph decoders generalize that local
evidence into an iterative belief update over a much larger graph.

## Before You Trust the Code

When I see an error-correcting code in a system, I want a ledger:

- channel model: independent flips, burst errors, erasures, soft information, or
  something messier;
- code rate and block length;
- minimum distance or an empirical distance proxy;
- guaranteed correction and detection radius;
- probability of wrong accepted data versus detected failure;
- latency budget for decoding;
- whether the decoder uses hard bits or reliability scores;
- interleaving strategy if burst errors are plausible;
- behavior near the operating point, not only asymptotic capacity;
- compatibility/versioning story for stored encoded data.

The most dangerous metric is "corrected errors." A high correction count can
mean the code is doing its job. It can also mean the channel is drifting toward
a regime where two-error patterns become common and silent miscorrection is next.

## The Sentence to Keep

An error-correcting code is a packing of messages in a noisy space.

Parity checks carve the space. Distance creates neighborhoods. The syndrome is
a coordinate system for the noise you promised to handle. When the noise leaves
that neighborhood, the honest decoder should know the difference between
correction and refusal.

## Primary Sources

[^hamming]: Richard W. Hamming, ["Error Detecting and Error Correcting Codes"](https://zoo.cs.yale.edu/classes/cs323/doc/Hamming.pdf), *Bell System Technical Journal*, 29(2), 1950. DOI: [10.1002/j.1538-7305.1950.tb00463.x](https://onlinelibrary.wiley.com/doi/10.1002/j.1538-7305.1950.tb00463.x).

[^shannon]: Claude E. Shannon, ["A Mathematical Theory of Communication"](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf), *Bell System Technical Journal*, 27, 1948.

[^gallager]: Robert G. Gallager, ["Low-Density Parity-Check Codes"](https://luca-giuzzi.unibs.it/Research/Coding/Files/Gallager.pdf), *IRE Transactions on Information Theory*, 8(1), 1962.

[^mackay]: David J. C. MacKay and Radford M. Neal, ["Near Shannon Limit Performance of Low Density Parity Check Codes"](https://www.inference.org.uk/mackay/abstracts/mncEL.html), *Electronics Letters*, 32(18), 1996.
