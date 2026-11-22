---
layout: post
title: "Walking through the Lean proof of the Riemann Hypothesis"
description: >-
  An interactive observatory and conceptual walkthrough of Levent Alpöge and
  Claude's 17.4-million-line Lean proof of the Riemann Hypothesis and Dirichlet
  GRH: from a 12-line entry point through one-sided prime windows, a Gamma
  spotlight, a chain of √x theta lifts, Behrend digit spheres, and four kernels.
image: /assets/social/walking-through-the-lean-proof-of-the-riemann-hypothesis.png
date: 2026-11-21 13:30:00 -0500
excerpt: >-
  On November 20, 2026, Levent Alpöge released a proof of the Riemann Hypothesis
  as 175,187 comment-free Lean files. A day later, four independent kernels
  accepted it. Here is the entire proof in one interactive observatory, plus a
  walk through its core ideas.
links:
  - title: Lean statement
    url: https://leanprover-community.github.io/blog/posts/riemann-hypothesis/
  - title: Alpöge’s note
    url: https://alpo.ge/remark.pdf
  - title: Mirror
    url: https://github.com/Deicyde/riemann-hypothesis
styles:
  - /assets/css/riemann-hypothesis.css
scripts:
  - /assets/js/riemann-hypothesis.js
---

On November 20, 2026, Levent Alpöge [announced](https://alpo.ge/remark.pdf) a proof of the Riemann Hypothesis, discovered with Claude, that also settles the Generalized Riemann Hypothesis for every Dirichlet $$L$$-function. There is no paper. Rendering the argument into prose ran past 250,000 pages, so Alpöge uploaded 14 compressed archives holding 175,187 Lean files, 17,374,215 lines of code, and zero comments.

Twenty-four hours later, the Lean and Mathlib communities [certified](https://leanprover-community.github.io/blog/posts/riemann-hypothesis/) that the library passes every mechanical check. Its top theorem is Mathlib's own definition of `RiemannHypothesis`, it uses only Lean's three standard axioms, and four independent kernels accept its 61.6 GB proof export.

A passing kernel confirms the conclusion follows from the axioms, not why the zeros of $$\zeta(s)$$ stay on $$\operatorname{Re} s = \frac{1}{2}$$. Below is the entire Lean proof in one interactive map, built from the exact Git tree at commit `40e56bab`, Bartosz Naskręcki's [dependency map](https://github.com/nasqret/riemann-rev), and Andrew Sutherland's [verification ledger](https://math.mit.edu/~drew/grh/). Every single one of the **175,187 `.lean` files** shines as its own star across **3,614 directories**, funneling inward through **109 verified declarations** and **113 call arcs** into the 12 lines of `Main.lean` at the center.

<figure class="fig wide rh" id="rh-mega" data-atlas="{{ '/assets/data/riemann-hypothesis/atlas.json' | relative_url }}" style="--reserve: 640px">
<figcaption>The complete Lean proof of the Riemann Hypothesis: all 175,187 <code>.lean</code> files rendered as individual clickable stars across 3,614 directories and 12 radial libraries, bridged inward to 109 verified declarations and 113 dependency arcs converging into <code>Main.lean</code> (12 lines) at the center. Zoom in and click any star, folder, or theorem to read its complete Lean 4 proof and live <code>import</code> arcs right inside the graph, search any proof by name, or press <code>▶ Cascade</code> (Space) to replay the proof collapsing inward.</figcaption>
</figure>

## From twelve lines to a one-sided prime wave

Open <a class="act" href="#rh-mega" data-thm="main-rh"><code>src/Main.lean</code></a> at the center of the map and the entire top of the proof fits in 12 lines: Mathlib's `RiemannHypothesis` plus four forms of Dirichlet GRH. Two classical reductions collapse all five theorems into one half-plane claim (<a class="act" href="#rh-mega" data-thm="all-chi" data-fit="1"><code>allChi</code></a>): for every primitive Dirichlet character $$\chi$$, $$L(s, \chi)$$ has no zeros in $$\operatorname{Re} s > \frac{1}{2}$$. First, <a class="act" href="#rh-mega" data-thm="imprimitive" data-fit="1">conductor descent</a> (`UpperTheory.Top.imprimitive`) extends nonvanishing from primitive characters to every modulus, since the missing Euler factors $$(1 - \chi^*(p) p^{-s})$$ never vanish for $$\operatorname{Re} s > 0$$. Second, <a class="act" href="#rh-mega" data-thm="vw-crit" data-fit="1">functional reflection</a> (`Formalism.VW.critLine`) pairs each zero $$\rho$$ of $$L(s, \chi)$$ in the strip with a zero of $$L(s, \bar\chi)$$ at $$1 - \rho$$. Clearing $$\operatorname{Re} s > \frac{1}{2}$$ for all primitive characters at once locks every strip zero onto $$\operatorname{Re} s = \frac{1}{2}$$.

The proof never searches for zeros. It tracks a smoothed prime sum (<a class="act" href="#rh-mega" data-thm="g-m" data-fit="1"><code>Formalism.HC.Level.Gm</code></a>) built from the von Mangoldt function $$\Lambda(n)$$ (equal to $$\log p$$ at prime powers $$p^k$$ and $$0$$ elsewhere) and Euler's constant $$\gamma \approx 0.5772$$:

$$
G(y) = \sum_{n \le y} \Lambda(n)\left(\frac{y}{n} - 1\right) - y\log y + (1 + \gamma)y.
$$

For a cyclic family $$P = \langle \psi \rangle$$ of primitive characters of order $$o$$, it forms the positively weighted average $$G_P(y) = G(y) + \frac{1}{3o+1}\sum_{\chi \in P \setminus \{1\}} \operatorname{Re} g_\chi(y)$$, so zero residues from different characters push together and cannot cancel. The ramp weight $$(y/n - 1)_+$$ has Mellin transform $$n^{-s}/(s(s-1))$$, turning the explicit formula into a convergent sum over zeros. Under RH, $$(G(y) - \log 2\pi)/\sqrt{y}$$ stays forever inside $$\pm(2 + \gamma - \log 4\pi) \approx \pm 0.0462$$ (up to $$10^6$$, the real prime sieve stays within $$[-0.0227, +0.0187]$$ and matches the first 100 zeros to 0.00053). Any zero at $$\operatorname{Re} \rho = \beta > \frac{1}{2}$$ adds a wave growing like $$y^{\beta - 1/2}$$ that tears through the band.

Crucially, the arithmetic side never bounds $$\lvert G_P(y)\rvert$$ everywhere. It only proves a **one-sided upper bound** $$G_P(y) \le C y^\theta$$ on sparse, arbitrarily late windows $$[Y, Y^{3/2}]$$. <a class="act" href="#rh-mega" data-thm="landau" data-fit="1"><code>Deduction.zeroFree_of_rpow_window</code></a> turns that into a zero-free half-plane $$\operatorname{Re} s > \theta$$: differentiating the Laplace transform $$\Phi(z)$$ of $$g(u) = G_P(e^u)$$ $$k$$ times creates a Gamma kernel $$u^k e^{-\sigma u}/k!$$ that locks onto $$[U, 1.5U]$$, putting 68.0% of its mass inside the window at $$U = 20$$, 95.2% at $$U = 80$$, and 99.99% at $$U = 320$$. One algebraic identity, $$\lvert g\rvert + g = 2\max(g, 0) \le 2R$$, removes the need for lower bounds. Because the arithmetic delivers $$G_P(x) \le x^{1/2 + 9\varepsilon}$$ for every small $$\varepsilon > 0$$ with the constant 9 fixed first, <a class="act" href="#rh-mega" data-thm="window-consumer" data-fit="1"><code>level_of_tiedWin</code></a> handles any hypothetical zero at $$\operatorname{Re} \rho = \beta > \frac{1}{2}$$ by setting $$\theta$$ halfway between $$\frac{1}{2}$$ and $$\beta$$ and choosing $$\varepsilon \le (\theta - \frac{1}{2})/9$$, letting the off-line pole outrun the window ceiling exponentially as $$U \to \infty$$.

## The core engine: a chain of square-root theta lifts

Over finite fields $$\mathbb{F}_q$$, Sergei Stepanov proved RH for curves by constructing an auxiliary polynomial vanishing to high multiplicity at every rational point. Over $$\mathbb{Z}$$, you cannot differentiate integers to manufacture multiplicity. Alpöge and Claude's central idea is to build multiplicity automorphically, through a chain of $$m$$ iterated **theta lifts** (integral transforms moving automorphic forms across symmetry groups) between totally definite unitary groups:

$$
U(X_0) \longrightarrow U(X_1) \longrightarrow \cdots \longrightarrow U(X_m).
$$

Along the chain inside `Formalism`, `ChainInt` clears denominators step by step, Frobenius congruences (<a class="act" href="#rh-mega" data-thm="minor" data-fit="1"><code>key_minor_dvd</code></a>) force divisibility into $$2 \times 2$$ minors, and <a class="act" href="#rh-mega" data-thm="slope" data-fit="1">Bost's slope inequality</a> (`slopeInequality_of`) bounds Euclidean lattice slopes. Then <a class="act" href="#rh-mega" data-thm="core-gm" data-fit="1"><code>UpperTheory.Comparison₂.core_gm</code></a> runs a **finite character comparison**: main terms on the analytic and geometric sides match prime-by-prime and cancel via Fourier orthogonality on $$E_0 \times A$$, leaving four bracket terms in $$B/Q$$:

$$
\frac{B}{Q} = \underbrace{\frac{a_E}{m b}}_{\le\, 2x/m} + \underbrace{\frac{a_E m}{b k}}_{\le\, 2} + \underbrace{2\,\frac{n}{u}\,m\,x^{\varepsilon}}_{\le\, 4m\,x^{9\varepsilon/8}} + \underbrace{\frac{v}{u}\,\frac{k}{n^2}\,x^{2\varepsilon}}_{\le\, 2x^{1/2+9\varepsilon/8}}.
$$

Write the chain length as $$m = x^a$$. The truncation cost $$x/m = x^{1-a}$$ shrinks as you add lifts, while the accumulated lift cost $$m = x^a$$ grows. Stopping short at $$a = 1/3$$ stalls at $$x^{2/3}$$ (matching entry 14 of Alpöge's timeline). Minimizing $$\max(1 - a, a)$$ locks onto $$m \asymp \sqrt{x}$$; in Lean, <a class="act" href="#rh-mega" data-thm="rank" data-fit="1"><code>GlobalTheory.EX.RankVal</code></a> places the chain at $$m \asymp x^{1/2 - \varepsilon/16}$$. **That tug-of-war between $$x/m$$ and $$m$$ is where the exponent $$\frac{1}{2}$$ of the Riemann Hypothesis enters the proof.** Five rational losses in `CoreGm.lean` ($$\frac{13}{8}$$ from the worst budget term, $$5$$ from the prefactor $$e_D + e_L + 3$$ with $$e_D = 2, e_L = 0$$ fixed before $$\varepsilon$$, $$1$$ from density $$2/\delta$$, $$\frac{3}{8}$$ to absorb the scalar 26, and $$1$$ for discarded characters) stack up cleanly to $$9\varepsilon$$.

## Feeding the chain: Galois row, twist dodging, and digit spheres

Building those geometric families fills 141,928 files of `Development` (70.4% of the archive, dominated by <a class="act" href="#rh-mega" data-dir="Development/AbelianVarietyTheory">99,187 files in <code>AbelianVarietyTheory</code></a> and its single 42,424-file cluster <a class="act" href="#rh-mega" data-dir="Development/AbelianVarietyTheory/Proofs/DivisorProofs"><code>DivisorProofs</code></a>). At the base sits one theorem (<a class="act" href="#rh-mega" data-thm="row-prod" data-fit="1"><code>galoisLocalGlobalStrong_recParameter</code></a>, the **Galois row**), which attaches continuous semisimple $$\ell$$-adic Galois representations matching Satake parameters to regular algebraic polarized cuspidal representations on $$\mathrm{GL}_a$$ over CM fields. In `MainConclusion.lean`, this single row supplies both the seven automorphic inputs (`OpenLiteratureStatements`) and a weakened Vandiver bound (<a class="act" href="#rh-mega" data-thm="vwin-row" data-fit="1"><code>VWinAt ψ 401</code></a>) controlling locally trivial Galois cohomology $$H^1$$ lengths up to twist $$x^{401}$$ across a power window $$[Y, Y^2]$$.

Two elementary tricks carve out clean windows when individual twists might spike. First, **ultrametric separation**: calling a twist $$1 \le h \le Z$$ exceptional when $$\ell^{k+1} \mid (h - s_i)$$ with $$\ell^{k+1} > Z$$ allows at most one bad twist per centre, regardless of $$Z$$ (for $$\ell = 3, Z = 80$$, mod 81 leaves only $$h = 1$$, while relaxing to mod 27 leaks $$\{1, 28, 55\}$$). Second, **`window1` interval dodging**: each bad twist spoils one logarithmic band $$[a, Ba)$$, and a four-line recursion drops at most $$R$$ bands while guaranteeing a clean sub-interval $$[y, 2y]$$ above $$U/(2^{R+2}B^R)$$.

To choose auxiliary primes $$q \equiv 3 \pmod 8, d \equiv 7 \pmod{16}$$ (`QH.pairEx`) and build the Iwasawa tower without short linear collisions, the proof borrows a 1946 construction from additive combinatorics: <a class="act" href="#rh-mega" data-thm="behrend" data-fit="1"><strong>Behrend's digit sphere</strong></a> (`sphere_rel`, `hostThickExists`). The six permutations of $$(0, 1, 2)$$ all have squared norm 5 and sit on a sphere in $$\{0, 1, 2\}^3$$; encoded in base $$4Ld = 24$$ (as 26, 49, 578, 624, 1153, 1176), base 24 prevents carries and forces any affine relation onto a straight line, which meets a sphere at most twice. All 1,440 short relations fail (shrinking to base 3 forges 48 carry collisions like $$7, 11, 15$$, while adding the off-sphere midpoint $$(1, 1, 1)$$ creates the collinear triple $$26, 601, 1176$$).

## Four kernels, what broke, and Robin's 5,040 cliff

Checking the archive against Kevin Buzzard's [four criteria](https://xenaproject.wordpress.com/2026/11/12/and-the-proof-is-checked-in-lean/) surfaced three technical wrinkles, and resolving them made the certification solid:

- **98,219 `.olean` hashes disagreed across machines.** Lean `v4.33.1` writes absolute source paths into linter logs inside `.olean` files. Recompiling at the same directory path matched, and `lean4export` strips linter logs to produce the identical 61,570,595,788-byte export (`sha256 5ea74b91…`) across independent builds.
- **Two checkers needed updates or raised fuel.** The older `con-leche` bundled with Lean `v4.36.0` exited with status 2 (declined) on one mutual reflexive inductive (`PrincipalizationCertificate`), and 5 modules hit `lean4lean`'s default step budget on `decide +kernel`. Switching to `con-leche` `master` accepted all 1,468,418 exported declarations in 3 minutes 15 seconds on 64 threads, and raising `lean4lean`'s fuel limit passed all 175,187 modules.
- **Custom tactics skipped elaborator checks.** Scans found zero `sorry`, `axiom`, `native_decide`, or `unsafe` declarations, but did find metaprogramming shortcuts (`kexactB` in 67 files, `kcopy`, 33 `run_tac` blocks) that assign proof terms without pre-checking types. Replaying the inert export through four independent kernels (`leanchecker`, `con-leche` and `con-ron` proven sound in set theory, Rust `nanoda`, and `lean4lean`) bypassed those tactics completely.

One last check removes $$\zeta(s)$$ from the theorem statement. In 1984, Guy Robin proved RH is equivalent to an elementary inequality on the sum of divisors $$\sigma(n) = \sum_{d \mid n} d$$:

$$
\sigma(n) < e^{\gamma}\, n \log\log n \qquad \text{for every } n > 5{,}040.
$$

Chaining Alpöge's archive with `kimihiro64/Robin1984` and replaying the combined 61.75 GB export through `con-leche` and `nanoda` certifies both Robin's bound and Jeffrey Lagarias's threshold-free variant $$\sigma(n) \le H_n + e^{H_n}\log H_n$$. In integer arithmetic, $$n = 5{,}040$$ ($$\sigma = 19{,}344$$, ratio 1.00556) is the 26th and final exception; every integer past it, including the next peak at $$n = 10{,}080$$ (0.98582), stays below 1 unconditionally.

For 167 years, confidence in a proof followed human reading. Here independent kernels signed off in a day while mathematicians are still opening the 175,187 files. Detours like Behrend digit spheres will almost certainly fall away as the argument shrinks; what will remain at the core is the $$\sqrt{x}$$ chain of theta lifts making Stepanov's multiplicity work over $$\mathbb{Z}$$.

<details class="rh-methods" markdown="1">
<summary>Sources, verification records, and visualization data</summary>

Every Lean declaration name, file count, and verification receipt comes from the public record published on November 20–21, 2026:

- **Announcement and source archive:** Levent Alpöge, [*Remark*](https://alpo.ge/remark.pdf) (November 20, 2026), and the unmodified mirror [`Deicyde/riemann-hypothesis`](https://github.com/Deicyde/riemann-hypothesis) at commit `40e56bab026552e089d7afcfeff08d2defb9c005` (175,187 files, 17,374,215 lines, 818,755 theorems/lemmas, 242,067 definitions/structures; Lean `v4.33.1`, Mathlib `v4.33.1`).
- **Community certification and independent audits:** [Lean and Mathlib communities statement](https://leanprover-community.github.io/blog/posts/riemann-hypothesis/) (November 21, 2026), Andrew Sutherland's [verification files and logs](https://math.mit.edu/~drew/grh/) (MIT), Kevin Buzzard's [four-criterion checklist](https://xenaproject.wordpress.com/2026/11/12/and-the-proof-is-checked-in-lean/), and [`kimihiro64/Robin1984`](https://github.com/kimihiro64/Robin1984) for the Robin and Lagarias criteria.
- **Architectural reverse-engineering:** Bartosz Naskręcki's open-source map [`nasqret/riemann-rev`](https://github.com/nasqret/riemann-rev) (0BSD), tracing all 109 verified declarations, 113 call edges, two machine-checked cuts, and the rational bookkeeping in `CoreGm.lean`.
- **Full cosmic map build:** `_tools/riemann-hypothesis/build_atlas.py` extracts every one of the 175,187 `.lean` file paths across all 3,614 directories from the Git tree at `40e56bab`, builds a 12-sector non-crossing polar dendrogram, joins it with all 109 declarations and 113 call arcs arranged by concentric graph distance from `Main.lean`, and renders all 175,187 files as individual stars in the browser. Numerical bounds cited in the text were independently verified by `_tools/riemann-hypothesis/build_data.py`.

[Atlas dataset (JSON)]({{ '/assets/data/riemann-hypothesis/atlas.json' | relative_url }})

</details>
