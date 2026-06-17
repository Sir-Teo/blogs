---
layout: post
title: "The Square Root Was in the Exponent"
description: "Quake III's famous fast inverse square root is not dark magic. It is a logarithm hiding in IEEE float bits, followed by one Newton repair step."
date: 2026-06-17 10:05:00 -0400
categories: gaming
tags: [fast-inverse-square-root, quake-iii, floating-point, newton-method, computer-graphics, numerical-methods, gaming]
excerpt: "A 32-bit float already carries a crude logarithm. The famous 0x5f3759df trick spends that encoding as an initial guess, then lets Newton's method clean up the mess."
---

The code became famous because it looked like a spell.

```text
float bits -> integer
magic - half the bits
integer bits -> float
repair it once with Newton
```

That is not how numerical algorithms are supposed to introduce themselves.

The function computes an approximation to

$$
\frac{1}{\sqrt{x}}.
$$

In a 3D engine, that expression is everywhere. To normalize a vector \(v\),
compute \(v \cdot v\), take an inverse square root, and multiply:

$$
\hat v = v \cdot \frac{1}{\sqrt{v \cdot v}}.
$$

Lighting, collision normals, camera vectors, reflections, and physics all keep
asking for unit vectors. In the software-rendering and early hardware-accelerated
era, a fast approximate inverse square root could be worth real frame time.

The version made famous by *Quake III Arena* lives in id Software's released
source as `Q_rsqrt` in `q_math.c`.[^quake] But the best way to read the hack is
not as a Quake anecdote. It is a tiny systems lesson:

> representation is a model.

IEEE single-precision floats store a sign bit, an eight-bit biased exponent, and
a 23-bit fraction.[^goldberg] If you reinterpret a positive float as an integer,
the resulting integer is not the logarithm of the number. But over a useful
range, it behaves like a cheap affine proxy for \(\log_2 x\). And if

$$
y = \frac{1}{\sqrt{x}},
$$

then

$$
\log_2 y = -\frac{1}{2}\log_2 x.
$$

The mystery line is doing that operation crudely in the integer encoding. The
right shift divides the bit-pattern proxy by two. The magic constant supplies
the offset. The result is not accurate enough to trust, but it is close enough
for one Newton step to repair.

## The Repair Step

The Newton update used by the algorithm is:

$$
y_{n+1}
= y_n\left(\frac{3}{2}-\frac{x}{2}y_n^2\right).
$$

This comes from solving \(1/y^2 - x = 0\). If \(y_n\) is already close to
\(1/\sqrt{x}\), the update squares away a lot of the relative error in one
multiply-heavy pass.

Chris Lomont's 2003 note is still the compact explanation I like most: it asks
where `0x5f3759df` came from, reports a maximum relative error of about
`0.00175228` for the one-step version over all floats, and shows that nearby
constants can slightly improve the worst case.[^lomont] Charles McEniry later
walked through the bit-level derivation in more detail, including the logarithm
approximation and candidate constants such as `0x5f375a86`.[^mceniry]

The lab below recreates the trick in JavaScript using typed-array
reinterpretation, then audits the result. It is not benchmarking speed. Modern
hardware and compilers have their own square-root and reciprocal-square-root
paths; the x86 `RSQRTSS` instruction, for example, is explicitly an approximate
reciprocal square-root operation.[^intel] The point here is accuracy mechanics:
which part is the bit guess, which part is Newton, and how much visible normal
error remains.

<style>
  .fisr-lab {
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

  .fisr-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 1rem;
  }

  .fisr-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fisr-lab output {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .fisr-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .fisr-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 0 0 1rem;
  }

  .fisr-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.7rem 0.75rem;
  }

  .fisr-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .fisr-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.88rem, 2.4vw, 1.08rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .fisr-lab__metric.good strong {
    color: #0f766e;
  }

  .fisr-lab__metric.warn strong {
    color: #b45309;
  }

  .fisr-lab__metric.bad strong {
    color: #be123c;
  }

  .fisr-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .fisr-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 640px) {
    .fisr-lab {
      padding: 0.75rem;
    }

    .fisr-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="fisr-lab" data-fisr-lab>
  <div class="fisr-lab__controls">
    <label>
      Magic offset <output data-value="magicOffset">+0</output>
      <input type="range" data-param="magicOffset" min="-1024" max="1024" step="1" value="0" aria-label="Magic constant offset from 0x5f3759df">
    </label>
    <label>
      Newton steps <output data-value="steps">1</output>
      <input type="range" data-param="steps" min="0" max="2" step="1" value="1" aria-label="Newton steps">
    </label>
    <label>
      Sample count <output data-value="samples">4096</output>
      <input type="range" data-param="samples" min="512" max="8192" step="512" value="4096" aria-label="Sample count">
    </label>
    <label>
      Input span <output data-value="span">2^-8 to 2^8</output>
      <input type="range" data-param="span" min="2" max="24" step="1" value="16" aria-label="Power-of-two input span">
    </label>
    <label>
      Light angle <output data-value="lightAngle">38 deg</output>
      <input type="range" data-param="lightAngle" min="0" max="80" step="1" value="38" aria-label="Diffuse light angle">
    </label>
  </div>
  <div class="fisr-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="680" aria-label="Fast inverse square root lab showing bit reinterpretation, error curves, constant sweep, and normal-length lighting error"></canvas>
  <p class="fisr-lab__note">
    The Audit tile checks float32 bit reinterpretation, the Quake seed for
    x=1, the known one-step output, the classic error range, the second Newton
    step, the Lomont constant, and the local constant sweep.
  </p>
</div>

<script defer src="{{ '/assets/js/fast-invsqrt-lab.js?v=20260617a' | relative_url }}"></script>

At the default settings, the raw bit guess is allowed to be quite rough: the
maximum relative error over the displayed grid is about `3.44%`. One Newton step
brings the maximum relative error down to about `0.1751%`. A second step drops
it to about `0.000473%`.

That is the shape of the hack:

```text
bits give the first shove
Newton repairs the guess
the application sets the error budget
```

The default one-step version is not "correct" in the IEEE sense. It is an
engineering bargain. For many old graphics uses, a normal-length error below two
tenths of a percent was often fine. For numerical simulation, geometry kernels,
or anything that accumulates error through many steps, it might not be fine at
all.

## What the Constant Is Buying

The constant is not arbitrary. It chooses a line through the float encoding that
will become a line through a logarithmic approximation.

For positive normal floats, the integer interpretation increases with the
exponent and then with the fraction. If you squint, that integer is proportional
to:

$$
E + m,
$$

where \(E\) is the biased exponent and \(m\) is the fractional part. That is a
cheap, piecewise-linear sketch of \(\log_2 x\). To approximate
\(-\frac12 \log_2 x\), halve the integer proxy and subtract it from a constant.

The lab's "constant audition" panel deliberately avoids pretending there is only
one magic number. On the default finite grid, a nearby offset can very slightly
beat the Quake constant. Lomont found `0x5f375a86` as a better single constant
under his full-float criterion.[^lomont] McEniry derives a closely related value
from an explicit error-balancing argument.[^mceniry]

So the real trick is not memorizing `0x5f3759df`. The trick is noticing that the
bit pattern can be spent as a log-domain initial guess.

## Who Wrote It?

The folk version says "John Carmack wrote the weird line." The evidence is more
interesting.

Rys Sommefeldt's Beyond3D investigation asked Carmack, Terje Mathisen, and Gary
Tarolli about the code. Carmack replied that it was not his and probably not
Michael Abrash's.[^beyond1] Tarolli recognized the code, remembered using and
tweaking constants, but did not claim original authorship. The follow-up article
reports that Greg Walsh contacted Beyond3D after publication and identified his
Ardent Computer implementation as the source, with Cleve Moler as the
inspiration for the Newton-iteration approach.[^beyond2]

That path is more believable than the myth because good hacks travel. A useful
approximation can pass through workstations, graphics companies, engine code,
forum posts, and finally a source release before the internet gives it a name.

The source release mattered. Without the Quake III GPL code, the algorithm might
have remained one more private graphics trick. With the source open, the snippet
became inspectable, portable, debatable, and teachable.

## The Portability Footnote Is Not Optional

The original C idiom type-puns through pointer casts. Modern C and C++ programmers
should be suspicious of copying it literally. Strict aliasing, integer width,
endianness assumptions, compiler optimizations, fast-math flags, denormals, and
target-specific reciprocal-square-root instructions all change the practical
question.

The question today is rarely "should I paste the Quake function?" It is closer
to:

- What accuracy do I need, in relative error and in the downstream quantity?
- Does the platform already provide a reciprocal-square-root approximation?
- Does one Newton refinement after a hardware estimate meet the error budget?
- Is the approximation deterministic enough for replay, networking, or tests?
- Does the compiler transform preserve the semantics I promised?

The beautiful part of the hack survives those caveats. It teaches a habit: when
the representation is structured, sometimes the first approximation is already
in the bits.

The square root was not computed.

It was found hiding in the exponent, then repaired.

[^quake]: id Software, [`q_math.c` in the Quake III Arena GPL source release](https://github.com/id-Software/Quake-III-arena/blob/master/code/game/q_math.c). The `Q_rsqrt` implementation appears near the end of the file with the `0x5f3759df` constant and one active Newton step.

[^goldberg]: David Goldberg, ["What Every Computer Scientist Should Know About Floating-Point Arithmetic"](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html), *ACM Computing Surveys*, 1991. The Oracle reprint includes the IEEE floating-point background and error terminology.

[^lomont]: Chris Lomont, ["Fast Inverse Square Root"](https://www.lomont.org/papers/2003/InvSqrt.pdf), 2003.

[^mceniry]: Charles McEniry, ["The Mathematics Behind the Fast Inverse Square Root Function Code"](https://0x5f37642f.com/documents/McEniryMathematicsBehind.pdf), 2007.

[^intel]: Intel, ["Intel C++ Intrinsics Reference"](https://www.intel.com/content/dam/develop/external/us/en/documents/18072-347603.pdf). The reference describes reciprocal and reciprocal-square-root SIMD approximation intrinsics as faster when their inaccuracy is acceptable.

[^beyond1]: Rys Sommefeldt, ["Origin of Quake3's Fast InvSqrt()"](https://www.beyond3d.com/content/articles/8/), Beyond3D, 29 November 2006.

[^beyond2]: Rys Sommefeldt, ["Origin of Quake3's Fast InvSqrt() - Part Two"](https://www.beyond3d.com/content/articles/15/), Beyond3D, 19 December 2006.
