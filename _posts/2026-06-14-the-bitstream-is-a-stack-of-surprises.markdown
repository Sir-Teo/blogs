---
layout: post
title: "Entropy Coders Stack Surprises"
description: "Entropy coding is the quiet machine underneath compression and modern prediction. A good model buys fractional bits; the coder's job is to turn that probability ledger into a reversible stream."
date: 2026-06-14 08:44:00 -0400
categories: computer-science
tags: [compression, entropy-coding, arithmetic-coding, ans, huffman-coding, information-theory]
excerpt: "A compressor is not only a bag of tricks. At the core is a contract: a model assigns probabilities, and an entropy coder turns the resulting surprise into bits without losing the message."
---

Compression has a glamorous surface and a quiet center.

The glamorous part finds repeated strings, predicts pixels, learns token
contexts, builds dictionaries, transforms blocks, and decides what the data is
trying to be. The quiet center does something colder. It receives a sequence of
probabilities and has to turn them into bits exactly.

That second part is entropy coding.

It is easy to underappreciate because it sounds like bookkeeping. But the
bookkeeping is the contract. If a predictor says the next symbol has probability
$$p$$, the ideal price of observing that symbol is

$$
\log_2 \frac{1}{p}
$$

bits. Common symbols are cheap. Surprises are expensive. Shannon's 1948 theory
made this average price precise through entropy, and that number remains the
center of gravity for lossless compression.[^shannon]

The problem is that bits are integers, while surprise is not.

If the model says $$p=0.3$$, the price is about $$1.737$$ bits. No one can write
0.737 of a bit after a symbol in an ordinary prefix code. Huffman coding solves
the best integer-length prefix-code problem for a known distribution, but each
individual codeword still has an integer length.[^huffman] Arithmetic coding
and ANS take a stranger route: stop assigning a separate little bit string to
each symbol. Let the whole message share the fractional accounting.

That is the trick this post is about.

## Three Ledgers

A useful way to look at a compressor is to split it into three ledgers.

The first ledger is the **source**. This is the actual process generating data.
It may be English text, sensor deltas, token IDs, transformed image residuals,
or something uglier. It has some true distribution $$P$$, even if no one knows
it.

The second ledger is the **model**. This is what the compressor believes. Call
it $$Q$$. If the model is wrong, the expected number of ideal bits is not
$$H(P)$$ but the cross entropy

$$
H(P, Q) = -\sum_x P(x)\log_2 Q(x).
$$

The gap

$$
H(P,Q)-H(P)=D_{\mathrm{KL}}(P \| Q)
$$

is the price of using the wrong probabilities. The coder cannot rescue that
mistake. It can only spend the probabilities it is given.

The third ledger is the **coder**. It has to represent the sequence in a finite
bitstream and decode it exactly. This is where Huffman, arithmetic coding,
range coding, and asymmetric numeral systems live.

The distinction matters because people often say "compression" when they mean
all three ledgers at once. A better predictor reduces cross entropy. A better
entropy coder reduces the overhead between the probability ledger and the bits
that actually hit disk.

Those are different wins.

## The Integer Problem

Suppose a four-symbol source has probabilities:

```text
A: 0.5
B: 0.25
C: 0.125
D: 0.125
```

This distribution is friendly to binary prefix codes. The ideal prices are
1, 2, 3, and 3 bits. Huffman can hit them exactly.

Now change the probabilities:

```text
A: 0.56
B: 0.18
C: 0.10
D: 0.07
E: 0.05
F: 0.04
```

The ideal prices are no longer integers. Huffman still builds the optimal
prefix code for the symbol alphabet, but it has to round structure into whole
codeword lengths. The rounding can be made smaller by coding blocks of two or
three symbols at a time, because the fractional parts can average out across a
larger object. That is real and useful. It is also a hint that per-symbol
codewords are the wrong primitive if the model is good enough to deserve
fractional prices.

Arithmetic coding replaces codewords with a shrinking interval. Each symbol
selects a subinterval whose width is proportional to its probability. After the
whole message, any binary fraction inside the final interval identifies the
message. Witten, Neal, and Cleary's classic exposition emphasized this
separation between the statistical model and the channel encoding: the model
supplies probabilities, while the arithmetic coder turns those probabilities
into a compact representation.[^witten]

The idea had already been developed through Rissanen and Langdon's arithmetic
coding work, and Howard and Vitter later gave a careful implementation-oriented
treatment of how finite-precision coders keep the overhead negligible in
practice.[^rissanen][^howard]

The final interval width is essentially

$$
\prod_{t=1}^{n} Q(x_t),
$$

so the number of bits needed is close to

$$
-\sum_{t=1}^{n} \log_2 Q(x_t).
$$

The fractional bits did not disappear. They pooled.

## A Small Entropy-Coder Bench

The lab below uses deterministic synthetic sources. It builds a coder model,
quantizes it into integer frequencies, encodes the sampled sequence with a
byte-renormalized rANS coder, decodes it, and compares the result with ideal
cross entropy and Huffman baselines.

The rANS implementation is intentionally small, but it is doing the real
operation: a single integer state is updated by the symbol's cumulative
frequency and renormalized by flushing bytes. The test is unforgiving. If the
decoder does not reproduce the exact original sequence, the round-trip metric
turns red.

<style>
  .entropy-coder-lab {
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

  .entropy-coder-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  }

  .entropy-coder-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .entropy-coder-lab__controls input,
  .entropy-coder-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .entropy-coder-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .entropy-coder-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .entropy-coder-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .entropy-coder-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .entropy-coder-lab__metric span,
  .entropy-coder-lab__legend,
  .entropy-coder-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .entropy-coder-lab__metric span {
    display: block;
  }

  .entropy-coder-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .entropy-coder-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .entropy-coder-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .entropy-coder-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .entropy-coder-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .entropy-coder-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .entropy-coder-lab {
      padding: 0.82rem;
    }

    .entropy-coder-lab__controls,
    .entropy-coder-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .entropy-coder-lab canvas {
      height: 1080px;
    }
  }
</style>

<div class="entropy-coder-lab" data-entropy-coder-lab>
  <div class="entropy-coder-lab__controls">
    <label>
      Source
      <select data-param="source">
        <option value="logs" selected>Service log</option>
        <option value="tokens">Tiny corpus</option>
        <option value="dyadic">Dyadic toy</option>
        <option value="flat">Flat-ish</option>
      </select>
    </label>
    <label>
      Symbols <output data-value="length">96</output>
      <input type="range" min="16" max="256" step="1" value="96" data-param="length">
    </label>
    <label>
      Model mismatch <output data-value="mismatch">15%</output>
      <input type="range" min="0" max="80" step="1" value="15" data-param="mismatch">
    </label>
    <label>
      Frequency table <output data-value="precision">2^10</output>
      <input type="range" min="6" max="12" step="1" value="10" data-param="precision">
    </label>
    <label>
      Seed <output data-value="seed">41</output>
      <input type="range" min="1" max="999" step="1" value="41" data-param="seed">
    </label>
  </div>
  <div class="entropy-coder-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Entropy coding lab comparing source entropy, cross entropy, Huffman coding, arithmetic intervals, and rANS state"></canvas>
  <div class="entropy-coder-lab__legend">
    <span><i style="background:#0f766e"></i> Source probabilities</span>
    <span><i style="background:#2563eb"></i> Coder probabilities</span>
    <span><i style="background:#7c3aed"></i> Arithmetic and rANS accounting</span>
    <span><i style="background:#d97706"></i> Huffman and byte flushes</span>
  </div>
  <p class="entropy-coder-lab__note">
    The rANS stream stores payload bytes plus a 32-bit final state. Short
    messages visibly pay that state overhead; longer messages reveal the
    asymptotic code rate.
  </p>
</div>
<script defer src="{{ '/assets/js/entropy-coder-lab.js?v=20260614a' | relative_url }}"></script>

Try four moves.

First, choose **Dyadic toy** and set model mismatch to zero. Huffman is almost
embarrassingly good here because the probabilities match powers of two. There
is little fractional accounting to pool.

Second, switch back to **Service log**. The single-symbol Huffman code spends
integer lengths, while the ideal and rANS ledgers can track fractional surprise
across the whole message. The block Huffman rows show why grouping helps: a
larger alphabet lets integer codeword lengths approximate fractional prices
more finely.

Third, raise **model mismatch**. The source entropy barely moves because the
source did not change. Cross entropy rises because the coder is now budgeting
against the wrong distribution. This is the cleanest place to see the
predictor-coder separation. A perfect entropy coder cannot undo a bad
probability forecast.

Fourth, lower **frequency table** precision. ANS and arithmetic coders are
usually implemented with integer frequency tables, not Platonic real-valued
probabilities. Coarse tables perturb the model. The penalty is often small, but
it is not zero, and rare symbols are where the quantization hurts first.

## ANS As a Stack Machine

Arithmetic coding is often explained with intervals. ANS is often explained
with a state.

The rANS variant used in the lab keeps a single integer $$x$$. To encode a
symbol $$s$$ with frequency $$f_s$$ and cumulative count $$c_s$$ in a table of
size $$M$$, the core update has the shape

$$
x' =
M\left\lfloor \frac{x}{f_s}\right\rfloor
+ (x \bmod f_s)
+ c_s.
$$

The details around this formula keep $$x$$ in a fixed range by flushing low
bytes into the bitstream. But the information-theoretic meaning is simple:
encoding a symbol with probability about $$f_s/M$$ increases the log-size of
the state by roughly

$$
\log_2 \frac{M}{f_s}.
$$

That is the same surprise ledger.

Duda's ANS papers framed the method as a way to combine arithmetic-coding-like
compression rates with a simpler single-state mechanism.[^duda] The trade is
beautifully odd. rANS encoding runs backward through the message, and decoding
recovers symbols forward. The bitstream behaves like a stack: bytes flushed
while encoding later symbols are consumed when decoding earlier state
transitions.

This is not just a toy curiosity. Zstandard's format uses Huffman coding for
literals and finite state entropy, an ANS-family method, for other symbol
streams and for Huffman headers. The RFC explicitly notes that FSE carries a
state across symbols and is decoded in the opposite direction from
encoding.[^zstd]

The quiet center is everywhere.

## Prediction Is the Expensive Part

The entropy coder is only as good as its probabilities. That sounds like a
limitation, but it is also why compression keeps reappearing as a lens on
machine learning.

A next-token language model is a probability model. If both encoder and decoder
can reproduce the same conditional probabilities, an entropy coder can turn the
observed token sequence into about

$$
\sum_t -\log_2 p_\theta(x_t \mid x_{<t})
$$

bits. This is the mechanical bridge behind the phrase "language modeling is
compression." Del'etang et al. used that equivalence to evaluate large models
as general-purpose compressors, not because a Transformer is secretly a zip
file, but because prediction quality can be cashed out through a lossless
coder.[^lmcompression]

The bridge has conditions. The decoder must see the same context and reproduce
the same probabilities. Tokenization matters. Numerical determinism matters.
The model itself is not free to transmit. And a compressor that spends enormous
compute to save a few bits may be scientifically interesting while being
economically silly.

Still, the equivalence is clarifying. Cross-entropy loss is not just a training
metric with a nice gradient. It is the expected code length of the data under
the model, up to the mechanics of the coder.

## What the Coder Cannot Fix

Entropy coding has a precise kind of humility.

It cannot discover structure that the model failed to assign probability to. It
cannot make a wrong distribution cheap. It cannot compress uniform randomness.
It cannot make finite messages ignore headers, states, tables, checksums, or
container overhead.

What it can do is more exact:

```text
given the same probability ledger on both sides,
turn surprise into a reversible bitstream
```

That is why the lab's round trip is the most important metric. Compression is
not a vibe. It is a receipt. Every saved bit must still leave enough
information for the decoder to walk the machine backward.

Huffman makes the receipt out of prefix codewords. Arithmetic coding makes it
out of a nested interval. ANS makes it out of a state that grows when it absorbs
surprise and shrinks when it gives bytes back.

Different machines. Same bill.

[^shannon]: Claude E. Shannon, ["A Mathematical Theory of Communication"](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf), *Bell System Technical Journal*, 1948.

[^huffman]: David A. Huffman, ["A Method for the Construction of Minimum-Redundancy Codes"](https://www.cse.iitd.ac.in/~pkalra/siv864/huffman_1952.pdf), *Proceedings of the IRE*, 1952.

[^witten]: Ian H. Witten, Radford M. Neal, and John G. Cleary, ["Arithmetic Coding for Data Compression"](https://web.stanford.edu/class/ee398a/handouts/papers/WittenACM87ArithmCoding.pdf), *Communications of the ACM*, 1987.

[^rissanen]: Jorma Rissanen and Glen G. Langdon Jr., ["Arithmetic Coding"](https://bitsavers.informatik.uni-stuttgart.de/pdf/ibm/IBM_Journal_of_Research_and_Development/232/ibmrd2302G.pdf), *IBM Journal of Research and Development*, 1979.

[^howard]: Paul G. Howard and Jeffrey Scott Vitter, ["Arithmetic Coding for Data Compression"](https://www.ittc.ku.edu/~jsv/Papers/HoV94.arithmetic_codingOfficial.pdf), *Proceedings of the IEEE*, 1994.

[^duda]: Jarek Duda, ["Asymmetric Numeral Systems: Entropy Coding Combining Speed of Huffman Coding with Compression Rate of Arithmetic Coding"](https://arxiv.org/abs/1311.2540), arXiv, 2013.

[^zstd]: Yann Collet and Murray Kucherawy, ["Zstandard Compression and the 'application/zstd' Media Type"](https://www.rfc-editor.org/info/rfc8878/), RFC 8878, 2021.

[^lmcompression]: Gregoire Del'etang et al., ["Language Modeling Is Compression"](https://arxiv.org/abs/2309.10668), ICLR 2024.
