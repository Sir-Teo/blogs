---
layout: post
title: "The Remainder Is a Quotient Estimate"
description: "Barrett and Montgomery reduction replace division by a fixed modulus with multiplication, shifts, and a small correction loop. The trick is not avoiding arithmetic; it is making the quotient almost right."
date: 2026-06-16 19:32:00 -0400
categories: software-engineering
tags: [modular-arithmetic, barrett-reduction, montgomery-reduction, cryptography, compilers, integer-arithmetic, performance]
excerpt: "Fast modular multiplication is a little act of controlled misprediction: estimate the quotient cheaply, subtract the modulus, and prove the remaining correction is tiny."
---

The `%` operator looks atomic.

It is not.

For a machine integer, the hardware may have a divide instruction. For a
multi-precision integer, a runtime library has to do long division. For a
cryptographic exponentiation, that reduction happens again and again under the
same modulus:

```text
x = a * b
r = x mod n
```

The expensive word is not "mod." The expensive word is "quotient."

If you knew

```text
q = floor(x / n)
```

then the remainder would be cheap:

```text
r = x - q * n
```

Barrett and Montgomery reduction are two ways of refusing to compute that
quotient by trial division. They do not make arithmetic disappear. They arrange
for a cheaper quotient-like object to be close enough that the last step is only
one or two conditional subtractions.

That is the mental shift:

```text
modular reduction = quotient estimation + correction
```

The correction is not a hack. It is the proof boundary.

## The Fixed Modulus Is The Opportunity

Division by an arbitrary number is a hard primitive. Division by the same number
over and over is a different problem.

Compilers exploit this difference for ordinary integer division. Granlund and
Montgomery's 1994 PLDI paper gives code sequences for division by arbitrary
nonzero constants and run-time invariants using multiplication, shifts, and a
few simple operations.[^granlund-montgomery] The opening motivation is still
recognizable: multiplication was getting cheaper relative to division, and an
invariant divisor can be preprocessed.

Modular arithmetic has the same smell. In RSA, Diffie-Hellman, elliptic-curve
field arithmetic, NTTs, and hash tables with fixed table sizes, the modulus
usually sits still while many values pass through it.

So the question becomes:

```text
What can I precompute from n so each future x mod n avoids division by n?
```

Barrett's answer is: precompute an integer approximation to `1 / n`.

Montgomery's answer is: stop representing residues in the usual coordinate
system.

Both answers are more interesting than "faster `%`."

## Barrett: Spend A Reciprocal Once

Let the radix be `beta`, usually a power of two, and let the modulus `n` have
`k` radix digits:

```text
beta^(k-1) <= n < beta^k
```

For inputs `x < beta^(2k)`, Barrett reduction precomputes:

```text
mu = floor(beta^(2k) / n)
```

Then it forms:

```text
qhat = floor(floor(x / beta^(k-1)) * mu / beta^(k+1))
```

That expression is ugly on the page and lovely on a machine. Divisions by
powers of `beta` are digit drops or shifts. Multiplication by `mu` is ordinary
integer multiplication. No division by `n` occurs in the hot path.

The Handbook of Applied Cryptography states the key bound for this algorithm:
if `Q = floor(x / n)`, then the computed `qhat` satisfies

```text
Q - 2 <= qhat <= Q
```

for the usual parameter range.[^hac] In other words, the approximate quotient
never overshoots and is at most two too small. That is exactly the kind of error
a correction loop can afford:

```text
r = x - qhat * n
while r >= n:
    r = r - n
```

At most two real subtractions of `n` are needed under those assumptions. The
algorithm is not hoping. It has traded a general division for a bounded
misprediction.

## Montgomery: Move The Number Line

Montgomery reduction is stranger.

Choose a value `R > n` such that `gcd(R, n) = 1`. In binary software, `R` is
usually a power of two, so modulo `R` and division by `R` are cheap bit
operations. The catch is immediate: if `R` is a power of two, an even modulus
does not work because it shares a factor with `R`.

Montgomery's REDC routine computes:

```text
T * R^(-1) mod n
```

without dividing by `n`.[^montgomery] With

```text
nprime = -n^(-1) mod R
m      = (T mod R) * nprime mod R
t      = (T + m*n) / R
```

the numerator is constructed so it is divisible by `R`. The division that
remains is a right shift. If `t >= n`, subtract `n` once.

The representation trick is to store an ordinary residue `a` as:

```text
aR mod n
```

Then multiplying two represented values and applying REDC keeps the product in
the same represented world:

```text
REDC((aR) * (bR)) = abR mod n
```

One final REDC converts out:

```text
REDC(abR) = ab mod n
```

Montgomery's original paper is explicit about the tradeoff: residues are
represented in a nonstandard way, so the method is useful when several
computations are performed modulo the same `N`.[^montgomery]

That is a very practical sentence. A single modular multiplication has to pay
for conversion. A long exponentiation can stay in Montgomery form for hundreds
or thousands of multiplies.

## A Small Lab For The Correction Boundary

The lab below implements both algorithms with exact JavaScript `BigInt`
arithmetic. It is deliberately small: single-word-ish moduli, visible radices,
and products `a*b` with `0 <= a,b < n`. The audit behind the lab checks:

- the Handbook of Applied Cryptography Barrett example, `3561 mod 47 = 36`;
- Barrett correctness over many moduli, radices, and residue pairs;
- the `Q - qhat` correction bound in those cases;
- Montgomery correctness for odd moduli;
- Montgomery rejection for even moduli when `R` is a power of two.

<style>
  .modred-lab {
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

  .modred-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
    margin-bottom: 1rem;
  }

  .modred-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .modred-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .modred-lab input[type="range"],
  .modred-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .modred-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
  }

  .modred-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .modred-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .modred-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.7rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .modred-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.94rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
  }

  .modred-lab__metric.is-good strong {
    color: #0f766e;
  }

  .modred-lab__metric.is-warn strong {
    color: #b45309;
  }

  .modred-lab__metric.is-bad strong {
    color: #be123c;
  }

  .modred-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .modred-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .modred-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .modred-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .modred-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .modred-lab {
      padding: 0.75rem;
    }

    .modred-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="modular-reduction-lab" class="modred-lab" data-modular-reduction-lab>
  <div class="modred-lab__controls">
    <label>
      Modulus n: <output data-value="modulus">97</output>
      <input type="range" min="5" max="251" step="1" value="97" data-param="modulus">
    </label>
    <label>
      Operand a: <output data-value="a">37</output>
      <input type="range" min="0" max="96" step="1" value="37" data-param="a">
    </label>
    <label>
      Operand b: <output data-value="b">54</output>
      <input type="range" min="0" max="96" step="1" value="54" data-param="b">
    </label>
    <label>
      Radix bits: <output data-value="radixBits">4</output>
      <select data-param="radixBits">
        <option value="2">2</option>
        <option value="4" selected>4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="8">8</option>
      </select>
    </label>
    <label>
      Chain length: <output data-value="chain">12</output>
      <input type="range" min="1" max="32" step="1" value="12" data-param="chain">
    </label>
  </div>
  <div class="modred-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Modular reduction lab comparing Barrett quotient estimation, Montgomery representation, correction subtractions, and amortized hot-loop division cost"></canvas>
  <div class="modred-lab__legend">
    <span><i style="background:#2563eb"></i> Barrett estimate</span>
    <span><i style="background:#0f766e"></i> Montgomery form</span>
    <span><i style="background:#b45309"></i> Precompute</span>
    <span><i style="background:#7c3aed"></i> Selected residue pair</span>
    <span><i style="background:#be123c"></i> Unavailable / invalid</span>
  </div>
  <p class="modred-lab__note">
    Deterministic exact arithmetic. The cost panel is a cartoon, not a hardware
    benchmark: it only separates one-time precomputation from hot-loop divisions
    by n. The correctness checks compare against exact BigInt remainders.
  </p>
</div>
<script defer src="{{ '/assets/js/modular-reduction-lab.js?v=20260616a' | relative_url }}"></script>

At the default setting:

```text
n = 97
a = 37
b = 54
x = 1998
```

The true quotient is `20`, and Barrett's `qhat` is also `20`, so the remainder
falls out immediately:

```text
1998 - 20 * 97 = 58
```

Montgomery also returns `58`, but by a different route. With radix bits `4`,
the lab chooses:

```text
R = 256
nprime = 95
```

and converts the operands:

```text
37R mod 97 = 63
54R mod 97 = 50
```

The first REDC call produces `7`, which is still a Montgomery-form residue. The
second REDC call converts it back to the ordinary residue `58`.

Now change `n` to an even number, say `96`. Barrett keeps working. Montgomery
turns red. Since `R` is a power of two, an even `n` has no inverse modulo `R`.
The method's cheapness depends on the representation being algebraically legal.

For a visible Barrett correction, set:

```text
n = 6
a = 2
b = 3
```

The product is `6`. The approximate quotient is one too small, so the temporary
remainder is `6`, and one subtraction of `n` repairs it to `0`. With a very
small radix, such as radix bits `2`, more dramatic examples can hit the two
subtraction boundary. The lab's correction map shows where those repairs live.

## The Correction Loop Is The Contract

It is tempting to describe Barrett as "replace division by multiplication." That
is directionally true, but it misses the engineering invariant.

The real invariant is:

```text
the approximate quotient is never too high and not too low by much
```

If `qhat` could overshoot, then

```text
x - qhat*n
```

could go negative in a way that needs more careful repair. If `qhat` could be
far too small, then the correction loop would become another division in slow
motion. The method works because the error is boxed in before the loop starts.

This is why the lab's correction map is more important than the final residue.
The final residue is supposed to agree. The map shows the algorithm's margin:
how often the cheap quotient estimate lands exactly, one `n` low, or two `n`s
low.

The Handbook's version uses `beta^(k+1)` in the temporary remainder step, so the
subtraction loop begins from a value congruent to `x mod n` and already below
`3n`.[^hac] That congruence plus the range bound is the whole game.

## Montgomery Is A Coordinate System

Montgomery reduction has a different personality.

Barrett says:

```text
keep the usual number, approximate division by n
```

Montgomery says:

```text
change the representation so division by R is the natural operation
```

That can feel like a trick until you remember that modular arithmetic already
works with representatives. The residue class of `a` modulo `n` can be named by
`a`, by `a+n`, by `aR mod n`, or by any other representative that preserves the
operations you need.

In Montgomery form, addition and subtraction are still ordinary modular
addition and subtraction. Multiplication uses REDC to remove one factor of `R`.
The cost is conversion:

```text
ordinary -> Montgomery -> many multiplies -> ordinary
```

That is why Montgomery shines in exponentiation. A square-and-multiply loop is
mostly modular multiplications under one fixed modulus. The endpoints are a
small part of the total bill.

The lab's chain-length control makes this visible with a toy cost model. Do not
read the numbers as CPU cycles. Read the shape: precomputation and conversion
are fixed costs; hot-loop division by `n` disappears.

## Special Moduli Are A Third Door

There is another family of reductions not shown in the lab: choose a modulus
whose shape makes reduction cheap.

If

```text
n = 2^k - c
```

then high bits can be folded back using the relation:

```text
2^k == c  (mod n)
```

This is one reason performance-oriented field implementations like primes close
to powers of two. But that freedom is domain-specific. RSA moduli cannot simply
be chosen for arithmetic convenience without changing the security story. The
Handbook is careful about special-form moduli: convenient reduction limits the
choice of primes and must not make factoring substantially easier.[^hac]

Barrett and Montgomery are valuable because they work for broad classes of
fixed moduli. They do not require the modulus to be cute.

## What The Compiler And The Crypto Library Share

A compiler optimizing:

```c
q = x / 10;
```

and a crypto library reducing:

```text
x mod n
```

are not solving the same problem. The first needs a quotient. The second needs
a residue. Signed division, rounding modes, overflow behavior, and
multi-precision representation all matter.

But they share a deep move:

```text
precompute a reciprocal-like fact about an invariant divisor
```

Then the hot path uses multiplication and shifts to recover enough information.
Granlund and Montgomery made that compiler move explicit for invariant integer
division.[^granlund-montgomery] Barrett and Montgomery reduction make the same
precomputation instinct central to modular arithmetic.

The important warning is that these are not interchangeable snippets. The proof
depends on ranges:

- Is `x < beta^(2k)` for the Barrett parameterization?
- Is `R > n` and `gcd(R, n) = 1` for Montgomery?
- Are intermediate products wide enough?
- Is the correction loop bounded and constant-time enough for the threat model?
- Are conversions into and out of Montgomery form accounted for?

Fast arithmetic is not just clever constants. It is clever constants plus range
proofs.

## The Remainder Was Never Alone

I used to think of `%` as a direct operation:

```text
give me the remainder
```

The better mental model is:

```text
guess the quotient
subtract the guessed multiple
repair the bounded error
```

Barrett makes the guess with a fixed-point reciprocal. Montgomery makes the
guess after moving into a representation where powers of two are easy to divide
out. Granlund and Montgomery show the same spirit in compiler division by
invariants.

The remainder is not computed in isolation. It is what is left after a quotient
estimate survives its correction audit.

That is a good pattern beyond arithmetic:

```text
replace an expensive exact decision
with a cheap estimate
only after proving the repair bill is small
```

The proof is the performance feature.

## Further Reading

[^barrett]: Paul Barrett, ["Implementing the Rivest Shamir and Adleman Public Key Encryption Algorithm on a Standard Digital Signal Processor"](https://link.springer.com/chapter/10.1007/3-540-47721-7_24), CRYPTO 1986, LNCS 263, 311-323. The Springer record describes the work as a high-speed RSA implementation on an off-the-shelf DSP with provably correct implementation techniques.

[^montgomery]: Peter L. Montgomery, ["Modular Multiplication Without Trial Division"](https://class.ece.iastate.edu/tyagi/cpre681/papers/montgomery.pdf), *Mathematics of Computation* 44(170), 519-521, 1985. The paper introduces REDC and the nonstandard residue representation.

[^hac]: Alfred J. Menezes, Paul C. van Oorschot, and Scott A. Vanstone, [*Handbook of Applied Cryptography*, Chapter 14](https://cacr.uwaterloo.ca/hac/about/chap14.pdf), CRC Press, 1997. Section 14.3.3 gives Barrett reduction as Algorithm 14.42, including the `Q - 2 <= qhat <= Q` bound and the at-most-twice correction note.

[^granlund-montgomery]: Torbjorn Granlund and Peter L. Montgomery, ["Division by Invariant Integers using Multiplication"](https://gmplib.org/~tege/divcnst-pldi94.pdf), PLDI 1994. The paper presents multiplication-based code sequences for division by constants and run-time invariant divisors.
