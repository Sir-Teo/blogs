---
layout: post
title: "Why matrix multiplication stops at nine fourths"
description: >-
  An interactive visual guide to OpenAI's November 24, 2026 preprint and Lean 4
  proof showing that the matrix multiplication exponent is exactly 9/4 over
  every field.
image: /assets/social/why-matrix-multiplication-stops-at-nine-fourths.png
date: 2026-11-24 22:00:00 -0500
excerpt: >-
  For 57 years, computer science bet matrix multiplication would reach n².
  OpenAI's preprint and Lean 4 proof close it at exactly 9/4 over every field.
  Six interactive visuals show why.
links:
  - title: Preprint (GitHub)
    url: https://github.com/openai/math/tree/main/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026
  - title: Paper (PDF)
    url: https://github.com/openai/math/blob/main/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026/paper.pdf
  - title: Lean proof
    url: https://github.com/openai/math/blob/main/lean/OAI/LinearAlgebra/SpectralBooks/ExactExponent.lean
  - title: Formalization scope
    url: https://github.com/openai/math/blob/main/lean/docs/107.md
styles:
  - /assets/css/matrix-exponent.css
scripts:
  - /assets/js/matrix-exponent.js
---

For fifty-seven years, theoretical computer science bet that $$\omega = 2$$. On November 24, 2026, OpenAI released a 111-page preprint and companion Lean 4 proof closing the problem at **$$\omega_F = 9/4$$ over every field $$F$$**—even for formal arithmetic circuits with division—matching the Fall 2026 polynomial-degeneration upper bound.

<div class="mm-hero-strip">
  <a class="mm-stat act" href="#mm-history" data-tab="race" data-zoom="1">
    <span class="mm-stat-val blue">9/4</span>
    <span class="mm-stat-k">Exact square ω</span>
    <span class="mm-stat-sub">Every field F · with division</span>
  </a>
  <a class="mm-stat act" href="#mm-history" data-tab="finite" data-n="256">
    <span class="mm-stat-val bad">2¹⁸</span>
    <span class="mm-stat-k">Border rank at n = 256</span>
    <span class="mm-stat-sub">Refutes Sun's 2¹⁷ &amp; Strassen</span>
  </a>
  <a class="mm-stat act" href="#mm-tripod" data-preset="unit">
    <span class="mm-stat-val good">6 ÷ 8/3</span>
    <span class="mm-stat-k">CAT(0) tripod peak</span>
    <span class="mm-stat-sub">Extremal wires (¾, ¾, ¾)</span>
  </a>
  <a class="mm-stat act" href="#mm-rect" data-t="0.5">
    <span class="mm-stat-val amber">α = 1/2</span>
    <span class="mm-stat-k">Exact dual knee</span>
    <span class="mm-stat-sub">Pinned in ExactExponent.lean</span>
  </a>
</div>

At every finite $$n \ge 2$$, the matrix multiplication tensor $$T_n$$ requires border rank $$\ge n^{9/4}$$ and $$\ge \lceil n^{9/4}/2\rceil$$ nonlinear gates. Press **▶ Replay 57 yrs**, toggle <a class="act" href="#mm-history" data-tab="race" data-zoom="1">Fall 2026 cliff</a>, or orbit the <a class="act" href="#mm-history" data-tab="finite" data-n="256">3D tensor wall at n = 256</a>.

<figure class="fig wide mm" id="mm-history" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 440px">
<figcaption>Left: 57 years of bounds slamming shut at $$9/4$$. Right: orbitable 3D tensor $$T_n$$ alongside the finite-size $$n^{9/4}$$ rank &amp; gate wall.</figcaption>
</figure>

## 1. Why 9/4? A negatively curved tripod

Place the three factors of $$T_n = \sum e_{ij}\otimes e_{jk}\otimes e_{ki}$$ at sites $$A, B, C$$ in a spectral metric space. The three matrix wires cost the triangle's perimeter, while a rank-$$r$$ algorithm broadcasts one shared label $$\ell \in [r]$$ at rate $$D$$, giving $$\omega \ge \text{perimeter}/D$$. Flat Euclidean geometry locks $$D = \frac{1}{2}\text{perimeter}$$ ($$\omega_{\text{lb}} = 2$$); a negatively curved **$$\operatorname{CAT}(0)$$ tripod** subtracts a parallel-resistor harmonic discount:

$$
D_*(a_1, a_2, a_3) \;=\; a_1 + a_2 + a_3 - \left(\frac{1}{a_1} + \frac{1}{a_2} + \frac{1}{a_3}\right)^{-1}
\quad\Longrightarrow\quad
\frac{6}{8/3} \;=\; \frac{9}{4}.
$$

Compare <a class="act" href="#mm-tripod" data-preset="euclid">Euclidean flat (2.00)</a> against <a class="act" href="#mm-tripod" data-preset="unit">Balanced tripod (9/4)</a>, or <a class="act" href="#mm-tripod" data-collide="1">Replay 4-tip collision</a> to see why any moving spectral site forces $$\omega \ge 9/4$$.

<figure class="fig wide mm" id="mm-tripod" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 490px">
<figcaption>Drag to orbit the shaded 3D $$\operatorname{CAT}(0)$$ saddle (left) or scrub the hillshaded AM–HM relief across $$a_1+a_2+a_3=3$$ (right).</figcaption>
</figure>

## 2. Exact rectangular terrain & the α = 1/2 cliff

While the paper's cyclic trick gives $$1/2 \le \alpha_F \le 2/3$$, the Lean proof (`ExactExponent.lean`) nails **$$\alpha_F = 1/2$$** and every rectangular triple $$x \ge y \ge z > 0$$ for division-free circuits:

$$
\omega(F; a, b, c) \;=\; x + y + \frac{\bigl[\max\bigl(0,\,(x + y)z - xy\bigr)\bigr]^2}{4xyz}.
$$

Multiplying $$n \times n^t$$ by $$n^t \times n$$ stays completely free at $$\omega = 2$$ up to the <a class="act" href="#mm-rect" data-t="0.5">Dual knee (t = 1/2)</a>, then rises along $$1 + t + \frac{1}{4t}$$ across the <a class="act" href="#mm-rect" data-t="1.0">Square peak (t = 1)</a>.

<figure class="fig wide mm" id="mm-rect" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 490px">
<figcaption>Orbit the Phong-lit excess terrain $$\omega(1,b,c) - \text{I/O}$$ (left) and scrub $$\omega(1,1,t)$$ with live 3D dot-product matrix blocks (right).</figcaption>
</figure>

## 3. Free fermions on ℙ¹ and sewn-sphere seams

Assuming $$\omega_F < 9/4$$ forbids moving sites, locking one synchronized spectral metric across rational families. Evaluating **free-fermion sphere tensors** at $$z_1, \dots, z_k \in \mathbb{P}^1$$ gives self-conjugate Young-diagram state spaces with $$\log \dim V_h \sim \frac{\pi}{\sqrt{3}}\sqrt{h}$$ and Wick Pfaffian propagators $$K_{ij} = (z_j - z_i)^{-1}$$.

<a class="act" href="#mm-fermion" data-mode="wick" data-collide="1">Collide z₄ → z₁</a> to watch the $$u^{-1}$$ pole fire a wire into the $$\operatorname{CAT}(0)$$ barycenter, then open <a class="act" href="#mm-fermion" data-mode="seam" data-step="1">3D Seam Portal</a> to see Möbius inversion $$V = 1/U$$ (Lemma 14.1) sweep high-arity tables onto $$O(W/\sqrt{D})$$ frozen collectors.

<figure class="fig wide mm" id="mm-fermion" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 515px">
<figcaption>Spin the 3D glass sphere $$\mathbb{P}^1$$ or drag $$z_i$$ to trigger Wick poles and Young diagrams; switch tabs to launch a table through a 3D seam throat.</figcaption>
</figure>

## 4. The contradiction reactor: p < 2 shatters w^σ

Over a finite field $$k$$, $$\omega_k < 9/4$$ builds both a **subquadratic sorting network** of size $$O(n h^p)$$ ($$p < 2$$) and a **macro compressor** combining seam concentration with wire-halving beats. Each round scales cost per copy by

$$
h^{-a\bigl[(1-\delta) - (1+\delta)(p-1)\bigr]},
$$

which shaves a real power **iff $$p < 2$$**. Iterated on Batcher's $$O(w^2)$$ network for **list distinctness** $$D_w$$, volume per bit crashes under Theorem 2.2's unbreakable $$w^\sigma$$ wall (Zariski specialization then lifts $$\omega_k \ge 9/4$$ to every field $$F$$). Watch <a class="act" href="#mm-engine" data-p="1.72" data-run="1">Shaving at p = 1.72</a> shatter the wall, or flip to <a class="act" href="#mm-engine" data-p="2.02" data-run="1">Overload at p = 2.02</a>.

<figure class="fig wide mm" id="mm-engine" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 515px">
<figcaption>Live 96-node reactor: drag $$p$$ across $$p = 2$$ or scrub rounds directly on the right-hand curve to watch the network collapse and shatter $$w^\sigma$$.</figcaption>
</figure>

## 5. The 97-star proof observatory

All 28 `.tex` files, 48 parsed declarations, and 21 spine milestones converge into $$\omega_F = 9/4$$ and `ExactExponent.lean` below. <a class="act" href="#mm-map" data-filter="spine">Trace contradiction spine</a> or fly to <a class="act" href="#mm-map" data-node="lean:exact">ExactExponent.lean</a>.

<figure class="fig wide mm" id="mm-map" data-src="{{ '/assets/data/matrix-exponent/data.json' | relative_url }}" style="--reserve: 640px">
<figcaption>Pan, zoom, search (<code>/</code>), click any of the 97 stars for verbatim LaTeX or Lean 4, or press <code>▶ Cascade</code> (<code>Space</code>).</figcaption>
</figure>

<div class="mm-caveats">
  <div class="mm-cav">
    <h4>Paper vs. Lean scope</h4>
    <p>Prose allows division and proves ω<sub>F</sub> = 9/4 and 1/2 ≤ α<sub>F</sub> ≤ 2/3. Lean uses division-free circuits (<code>propext</code>, <code>Quot.sound</code>, <code>Classical.choice</code>) and proves exact α<sub>F</sub> = 1/2 and ω(F; a, b, c).</p>
  </div>
  <div class="mm-cav">
    <h4>Fresh &amp; unaudited</h4>
    <p>Released as raw AI-generated math (<code>"enable_nanoda": false</code>) relying on two sibling Nov 24 preprints. Independent kernel audits and peer review are just beginning.</p>
  </div>
  <div class="mm-cav">
    <h4>Asymptotic floor</h4>
    <p>GPU matrix kernels won't change tomorrow; what changes is the theoretical limit beneath every future fast matrix multiplication algorithm.</p>
  </div>
</div>

<details class="mm-methods" markdown="1">
<summary>Sources &amp; verification ledger</summary>

Parsed directly from [`openai/math`](https://github.com/openai/math) (Nov 24, 2026) via `_tools/matrix-exponent/build_data.py` into a 71.6 KB [dataset]({{ '/assets/data/matrix-exponent/data.json' | relative_url }}):

- **Preprints:** [*The matrix multiplication exponent is nine fourths*](https://github.com/openai/math/tree/main/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026) (111 pp., 28 `.tex` files, 7,415 lines, 48 declarations), [*Euclidean geometry in the asymptotic spectrum of tensors*](https://github.com/openai/math/tree/main/preprints/Euclidean-geometry-in-the-asymptotic-spectrum-of-tensors-November-24-2026), and [*Circuit lower bounds for Hamiltonian cycle and the permanent*](https://github.com/openai/math/tree/main/preprints/Circuit-lower-bounds-for-Hamiltonian-cycle-and-the-permanent-November-24-2026).
- **Lean 4 (Family 107):** [`ExactExponent.lean`](https://github.com/openai/math/blob/main/lean/OAI/LinearAlgebra/SpectralBooks/ExactExponent.lean), [`ComparatorChallenges/MatrixExponent.lean`](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/MatrixExponent.lean), [`MatrixExponent.json`](https://github.com/openai/math/blob/main/lean/ComparatorChallenges/MatrixExponent.json), [`docs/107.md`](https://github.com/openai/math/blob/main/lean/docs/107.md).

</details>
