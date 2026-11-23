---
layout: post
title: "Walking through the Lean proof of Navier–Stokes blow-up"
description: >-
  An interactive observatory and conceptual walkthrough of Levent Alpöge and
  Tristan Buckmaster's 616,060-line Lean 4 formalization of finite-time blow-up
  for the unforced 3D Navier–Stokes equations: from a 19-arm discretely
  self-similar spiral through finite-codimension stability, cell-layer
  certificates, and six comparator contracts.
image: /assets/social/walking-through-the-lean-proof-of-navier-stokes-blow-up.png
date: 2026-11-22 00:30:00 -0500
excerpt: >-
  Alongside the Riemann Hypothesis archive on November 20, 2026, Levent Alpöge
  and Tristan Buckmaster released a 79-page paper and 2,271-file Lean 4 library
  reducing unforced 3D Navier–Stokes blow-up to a finite cell certificate. Here
  is the full formalization in one interactive map, plus a walk through its ideas.
links:
  - title: Repository
    url: https://github.com/tristanbuckmaster/navier-stokes
  - title: Paper (PDF)
    url: https://github.com/tristanbuckmaster/navier-stokes/blob/ad53419de079eb8f95f60313473374624a348546/paper/finite-time-blow-up-navier-stokes.pdf
  - title: Lean notes
    url: https://github.com/tristanbuckmaster/navier-stokes/blob/ad53419de079eb8f95f60313473374624a348546/lean/README.md
styles:
  - /assets/css/navier-stokes.css
scripts:
  - /assets/js/navier-stokes.js
---

On November 20, 2026, the day Levent Alpöge uploaded his Riemann Hypothesis archive, Alpöge and Tristan Buckmaster [released](https://github.com/tristanbuckmaster/navier-stokes) a 79-page paper and a Lean 4 formalization claiming finite-time blow-up for the **unforced** three-dimensional incompressible Navier–Stokes equations on both $$\mathbb{R}^3$$ and the torus $$\mathbb{T}^3$$. In Charles Fefferman's Clay Millennium formulation, that disproves global regularity statements (A) and (B) and proves breakdown statements (C) and (D).

The Lean package came first: Alpöge and Buckmaster built the library with Claude, generated an initial draft of the paper from the Lean text, and then rewrote the prose to cite standard theorems. Unlike the Riemann Hypothesis archive, however, this repository is a **conditional formalization**. Its **2,271 `.lean` files** (**616,060 lines**, **30,038 theorems and lemmas**, zero `axiom` or `native_decide`, and zero `sorry` inside `Solution.lean` or `Breakdown/`) prove the full analytical bridge from a finite 15-condition cell certificate to smooth blow-up. The numerical certificate data itself (`sha256 3f7a335b…`) and the 128-bit Arb/FLINT interval-arithmetic computation checking those 15 conditions are not yet in the repository.

Below is the entire Lean codebase in one interactive map, built from commit `ad53419`. Every one of the **2,270 Lean modules** shines as its own clickable star across **12 radial libraries** and **95 semantic clusters**, threaded by all **6,570 real in-repo `import` edges** and **116 verified spine declarations** converging into `Solution.lean` at the center.

<figure class="fig wide ns" id="ns-mega" data-atlas="{{ '/assets/data/navier-stokes/atlas.json' | relative_url }}" style="--reserve: 640px">
<figcaption>The complete Lean 4 formalization of Navier–Stokes finite-time blow-up (<code>tristanbuckmaster/navier-stokes</code>, commit <code>ad53419</code>): all 2,270 Lean modules (616,060 lines, 30,038 theorems) rendered as individual clickable stars threaded by 6,570 real import filaments across 12 radial libraries, bridged inward to 116 verified spine declarations converging into <code>Solution.lean</code> at the center. Click any star, cluster, or theorem to trace live imports and read its full Lean 4 proof inside the graph, search with <code>/</code>, or press <code>▶ Cascade</code> (Space) to replay the proof collapsing inward.</figcaption>
</figure>

## Escaping Leray: a nineteen-arm rotating spiral

Start with the unforced incompressible Navier–Stokes equations normalized to unit viscosity (rescaling $$(u, p) \mapsto (\nu u(\nu t, x), \nu^2 p(\nu t, x))$$ recovers every viscosity $$\nu > 0$$):

$$
\partial_t u + (u \cdot \nabla) u = \Delta u - \nabla p, \qquad \operatorname{div} u = 0.
$$

In 1934, Jean Leray proposed looking for a singularity via a steady backward self-similar ansatz $$u(t, x) = (T - t)^{-1/2} U(x / \sqrt{T - t})$$. Sixty years later, Nečas, Růžička, and Šverák (1996) and Tsai (1998) proved that no nonzero steady profile $$U \in L^p(\mathbb{R}^3)$$ exists. The next simplest ansatz is **backward discretely self-similar (DSS)**: switch to logarithmic time $$s = \log(T / (T - t))$$ and rescaled space $$y = x / \sqrt{T - t}$$, write $$u_T^*(t, x) = (T - t)^{-1/2} W(s, y)$$, and allow $$W(s, y)$$ to be **periodic in $$s$$** with period $$S > 0$$ up to a linear isometry $$R \in O(3)$$:

$$
\begin{gathered}
\partial_s W + \tfrac{1}{2} W + \tfrac{1}{2}(y \cdot \nabla) W - \Delta W + (W \cdot \nabla) W + \nabla q = 0, \\[4pt]
W(s + S, y) = R\, W(s, R^{-1} y).
\end{gathered}
$$

Rescaling time to $$\theta = s / S$$ turns the linear part into the operator $$T_S = \frac{1}{S}\partial_\theta + \frac{1}{2} + \frac{1}{2}(y \cdot \nabla) - \Delta$$. Because $$W(s, \cdot)$$ repeats after every factor $$\lambda = e^{-S}$$ in $$T - t$$, it sidesteps the Nečas–Růžička–Šverák Liouville barrier while keeping Type I decay $$\lvert W(s, y)\rvert \le C_W (1 + \lvert y\rvert)^{-1}$$ and Leray's blow-up rate $$\lVert\nabla u_T^*(t)\rVert_{L^2} \asymp (T - t)^{-1/4}$$.

The approximate profile $$\bar{W}$$ described in Appendix C is not axisymmetric. It is invariant under rotation by $$2\pi / 19$$ about the $$y_3$$ axis and rotation by $$\pi$$ about the $$y_1$$ axis, has period $$\bar{S} \approx 0.36$$, and shifts by $$\pi / 19$$ after half a period: $$\bar{W}(s + \bar{S}/2, y) = R_{\pi/19}\bar{W}(s, R_{\pi/19}^{-1} y)$$. Physically, its vorticity concentrates in a central column along $$y_3$$ feeding two counter-rotating 19-arm spiral wave sheets on opposite sides of the plane $$y_3 = 0$$, with $$\lVert\nabla \bar{W}\rVert_{L^2} \sim 10^4$$. Alpöge and Buckmaster did not guess this profile cold: they continued from a forced axisymmetric shear layer near scaling parameter $$g \approx 0.502$$, superposed azimuthal wave numbers 14 to 20, first solved an unforced **hyperdissipative** version $$\nu(-\Delta)^{501/500}$$ (which still occupies 846 files across <a class="act" href="#ns-mega" data-terr="FracCell"><code>FracCell</code></a>, <a class="act" href="#ns-mega" data-terr="FracCert"><code>FracCert</code></a>, and <a class="act" href="#ns-mega" data-terr="Frac"><code>Frac</code></a>, 37.3% of the repository), and then pushed a heavier nine-stage adaptive Newton–GMRES continuation down to standard viscosity $$\alpha = 1$$.

## Why one profile breaks both space and the torus

Suppose you have **any** nonzero smooth periodic similarity profile $$(W, q)$$ with decay $$\lvert W(s, y)\rvert \le C_W(1 + \lvert y\rvert)^{-1}$$. That profile itself need not have finite kinetic energy ($$L^2$$ can diverge at infinity) and is not periodic in space. Part 1 of the proof (<a class="act" href="#ns-mega" data-thm="sol-space" data-fit="1"><code>breakdown_on_space</code></a> and <a class="act" href="#ns-mega" data-thm="sol-torus" data-fit="1"><code>breakdown_on_torus</code></a> in `Challenge.lean`) turns any such profile into smooth, finite-energy blow-up on $$\mathbb{R}^3$$ and smooth periodic blow-up on $$\mathbb{T}^3$$, **without ever computing the spectrum of the linearized flow**.

The reason is subcriticality of $$\dot{H}^1_{\mathrm{div}}(\mathbb{R}^3)$$. Rescaling $$f \mapsto \sqrt{\mu}\, f(\sqrt{\mu}\,\cdot)$$ multiplies $$\lVert\nabla f\rVert_{L^2}$$ by $$\mu^{1/4}$$. Linearizing Navier–Stokes around $$u^* = u_1^*$$ over one self-similar period produces a monodromy operator $$M$$ whose essential spectral radius is strictly less than 1 (following Jia and Šverák's heat–Leray compactness argument, formalized in <a class="act" href="#ns-mega" data-thm="mod-spectral" data-fit="1"><code>Spectral.RealDichotomy</code></a>). Outside a shrinking disc $$\Theta = e^{-\kappa S}$$ with $$\kappa \in (0, \frac{1}{4})$$, $$M$$ can have at most **finitely many** unstable eigenvalues. Rather than trying to rule them out, <a class="act" href="#ns-mega" data-thm="mod-transfer" data-fit="1"><code>Transfer.Exports</code></a> runs a Lyapunov–Perron right inverse across periods and absorbs every unstable mode into a correction $$\gamma$$ chosen from a finite-dimensional subspace $$E \subset C^\infty_{c,\mathrm{div}}(\mathbb{R}^3)$$, with no modulation of blow-up time, location, or phase.

To produce finite-energy initial data on $$\mathbb{R}^3$$, <a class="act" href="#ns-mega" data-thm="mod-cutoff" data-fit="1"><code>Uniqueness.CutoffBounds</code></a> truncates the vector potential $$A(0)$$ of $$u^*(0)$$ at a large radius $$r$$, setting $$\bar{u}(0) = \operatorname{curl}(\eta(\cdot/r)A(0))$$. Applying the cutoff inside the curl keeps $$\operatorname{div} \bar{u}(0) = 0$$ while changing $$\dot{H}^1$$ by only $$O(r^{-1/2})$$, so the contraction finds a smooth compactly supported datum $$u_0 = \bar{u}(0) + \gamma$$ whose solution tracks $$u_1^*$$ up to $$t = 1$$ with

$$
\begin{gathered}
\lVert\nabla(u(t) - u_1^*(t))\rVert_{L^2} \le C(1 - t)^{\kappa - 1/4}, \\[4pt]
c(1 - t)^{-1/4} \le \lVert\nabla u(t)\rVert_{L^2} \le C(1 - t)^{-1/4}.
\end{gathered}
$$

On the torus $$\mathbb{T}^3$$, there is no exact periodic self-similar solution to linearize around. Instead, <a class="act" href="#ns-mega" data-thm="mod-torus-red" data-fit="1"><code>Torus.Reduction</code></a> rescales a large period-$$L$$ torus back to $$\mathbb{T}^3$$ with small blow-up time $$T = L^{-2}$$, cuts $$u^*$$ off at radius $$r = L/8$$, and tiles it periodically. Because the heat–Leray kernel on divergences decays like $$\lvert x\rvert^{-4}$$, the whole-space right inverse inverts the periodic linearization up to an $$O(L^{-1/2})$$ error removed by a Neumann series, while a Galilean frame change absorbs any linear pressure drift $$x \cdot a(t)$$ allowed by periodic velocities.

## Inside the certificate: cells, rotating frames, and a fixed-point box

Finding an exact periodic profile $$W$$ near the numerical candidate $$\bar{W}$$ is the job of Part 2 (<a class="act" href="#ns-mega" data-thm="sol-ext-orbit" data-fit="1"><code>extended_certificate_orbit</code></a>, Theorem 7.1) and Appendix B (<a class="act" href="#ns-mega" data-thm="sol-both" data-fit="1"><code>breakdownOnSpaceAndTorus_of_cell_system_condition</code></a>). That machinery fills 943 files across <a class="act" href="#ns-mega" data-terr="CertCell"><code>CertCell</code></a> (462 files), <a class="act" href="#ns-mega" data-terr="Cert"><code>Cert</code></a> (354 files), and <a class="act" href="#ns-mega" data-terr="CellReduction"><code>CellReduction</code></a> (127 files).

A naive computer-assisted Newton–Kantorovich proof would stall on the unbounded domain $$\mathbb{R}^3$$ and the infinite ladder of azimuthal and temporal harmonics. Alpöge and Buckmaster split the problem into two layers:

- **Coercive multipliers in rotating frames (`Cert`, `FreqTr`).** Perturbations are expanded into harmonics $$\iota = (\iota_1, \iota_2)$$ in time $$\theta$$ and azimuth $$\varphi$$. Away from the axis, <a class="act" href="#ns-mega" data-thm="sol-azim" data-fit="1"><code>mode_azimuthal_gain</code></a> gives a free Poincaré gain $$(\lvert n\rvert - 1)^2 / r^2$$ on velocity modes and $$(\lvert n\rvert - 2)^2 / r^2$$ on gradient modes for $$\lvert n\rvert \ge 2$$, while <a class="act" href="#ns-mega" data-thm="sol-stretch" data-fit="1"><code>stretch_mean_bound</code></a> controls the angular average of vortex stretching. For high-frequency harmonics outside $$\lvert\iota_2\rvert, \lvert\iota_2 - \iota_1\rvert \le j_*$$, piecewise spline weights $$\lambda_p, \mu_p$$ attached to the two counter-rotating pattern speeds $$\pm 2\pi / (19\bar{S})$$ convert large temporal frequencies into positive coercive energy terms (<a class="act" href="#ns-mega" data-thm="sol-piece-weak" data-fit="1"><code>pieceMultiplierDensityWeak</code></a>, Proposition B.1).
- **Meridian cell decomposition and a tree of matrix bounds (`CertCell`, `CellReduction`).** <a class="act" href="#ns-mega" data-thm="mod-stmt-defs" data-fit="1"><code>CertCell.StatementDefs</code></a> (6,263 lines, the largest file in the repository) partitions the meridian half-plane $$(r, z)$$ into rectangular cells $$Q = [r_1, r_2] \times [z_1, z_2]$$, models the profile by piecewise polynomials with a radial phase $$f_\alpha(\lvert y\rvert^2)$$ that unwinds the spiral arms at infinity, and packs all infinite-dimensional estimates into 15 explicit conditions (`CellSystemCondition`). On each cell, <a class="act" href="#ns-mega" data-thm="mod-cell-calc" data-fit="1"><code>CellCalculusStatements</code></a> (Proposition B.4) bounds the local quadratic form by a finite real matrix, and those matrices are summed upward along a finite rooted tree until the root matrix plus a global exterior term is positive definite.

From fixed constants $$w_* = \frac{39}{50}$$ and coercive bounds $$c_1 \ge \frac{50}{3}$$, $$c_L > 98.3$$, $$M < 0.01695$$, and $$\varepsilon < 0.0075$$, the certificate closes a nonlinear fixed point around a parameter box $$\alpha \in K$$ (which adjusts the period $$1/S(\alpha) = 1/S(0) + \varsigma \cdot \alpha$$ and finite-dimensional forcing multipliers to zero). Here the Lean proof diverges visibly from the paper: Section 7 of the paper applies Schauder–Tychonoff in a weak topology, whereas the formalization uses a contraction at each fixed parameter paired with a finite-dimensional Brouwer box theorem (<a class="act" href="#ns-mega" data-thm="mod-fixed-point" data-fit="1"><code>Cert.FixedPointBox</code></a>). That yields a true periodic profile within $$0.017$$ in $$\dot{H}^1$$ of the approximate family.

To finish both domains, Lean again takes a slightly different path from the paper. On $$\mathbb{R}^3$$, <a class="act" href="#ns-mega" data-thm="sol-weak" data-fit="1"><code>breakdown_on_space_of_weak</code></a> derives finite-energy blow-up from the weak $$L^6 / H^1$$ profile without upgrading it to $$C^\infty$$. On $$\mathbb{T}^3$$, <a class="act" href="#ns-mega" data-thm="mod-cert-torus-main" data-fit="1"><code>CertTorus.Main</code></a> proves `periodicLerayProfileExists_of_weak` internally inside the library and hands the smooth profile to `breakdown_on_torus`, closing <a class="act" href="#ns-mega" data-thm="mod-cert-torus-cor" data-fit="1"><code>CertificateCorollary</code></a>.

## Six comparators, what is proved, and what is still missing

Every top-level statement file (`Challenge.lean`, `CertificateChallenge.lean`, `ExtendedCertificateChallenge.lean`, `CoerciveChallenge.lean`, `ExtendedCoerciveChallenge.lean`, `CellLayerTheorems.lean`, and the three `Fractional*Challenge.lean` files) states its theorems with `sorry` as a clean problem specification. Six `comparator*.json` manifests pair those specifications with <a class="act" href="#ns-mega" data-thm="sol-both"><code>Solution.lean</code></a>, permitting only Lean's three standard axioms (`propext`, `Quot.sound`, `Classical.choice`). Inside `Solution.lean` and all 2,259 files of `Breakdown/`, automated scans find **zero `sorry`, zero `axiom`, and zero `native_decide`**.

Unlike the Riemann Hypothesis archive, however, this repository does **not** yet constitute an independently closed proof of Navier–Stokes blow-up. Alpöge and Buckmaster spell out three concrete gaps in `README.md` and `lean/README.md`:

1. **The numerical certificate data is not yet released.** The paper gives its SHA-256 hash (`3f7a335b84b6c7631742cacc5343dfcd11cf72f5221ff79b2b9268790b4b22c5`) and states that the certificate will be released soon, but no certificate file ships in this repository.
2. **The 128-bit interval-arithmetic verification sits outside Lean.** Checking that the finite polynomial and matrix data actually satisfy the 15 conditions of Appendix B / `CellSystemCondition` relies on a separate rigorous computation using 128-bit Arb interval arithmetic through FLINT, which is not part of the formalization and is not in this repository.
3. **A November 20 cell-layer patch was not rebuilt before upload.** Right before assembling the repository, the authors patched the cell-layer weight from $$m^2 + \frac{1}{4}$$ to $$(\lvert m\rvert + \frac{1}{2})^2$$, allowed one cell constant to be zero, and restricted cell model harmonics to those that do not vanish on the cell, noting that the patched package had not yet completed a fresh full `lake build`. In addition, two Appendix B lemmas (<a class="act" href="#ns-mega" data-thm="sol-piece-weak" data-fit="1">Proposition B.1</a> and <a class="act" href="#ns-mega" data-thm="mod-cell-calc" data-fit="1">Proposition B.4</a>) exist only in the Lean text and are omitted from the 79-page paper.

What already stands in public view is still extraordinary: a 616,060-line Lean 4 blueprint reducing one of the hardest open PDE problems in mathematics to an explicit finite list of polynomial and matrix inequalities, accompanied by a 79-page paper explaining the 19-arm rotating spiral mechanism. Once the hashed certificate and its Arb verifier are published and the patched Lean package builds cleanly through independent kernels, checking the blow-up claim becomes a concrete, mechanical audit.

<details class="ns-methods" markdown="1">
<summary>Sources, verification records, and visualization data</summary>

Every file count, line count, theorem name, and dependency edge in this post comes from the public repository [`tristanbuckmaster/navier-stokes`](https://github.com/tristanbuckmaster/navier-stokes) at commit `ad53419de079eb8f95f60313473374624a348546` (November 20, 2026):

- **Paper:** Levent Alpöge and Tristan Buckmaster, *Finite-time blow-up for the Navier–Stokes equations* (`paper/finite-time-blow-up-navier-stokes.pdf`, 79 pages, November 20, 2026; promised certificate SHA-256 `3f7a335b84b6c7631742cacc5343dfcd11cf72f5221ff79b2b9268790b4b22c5`).
- **Lean 4 formalization:** `lean/` (`Lean v4.33.1` + Mathlib): 2,271 `.lean` files (2,270 package modules + 1 script), 616,060 lines, 30,038 theorems/lemmas, 8,460 definitions/structures, 6,570 in-repo module import edges, 6 `comparator*.json` files (`propext`, `Quot.sound`, `Classical.choice` only), 0 `axiom`, 0 `native_decide`, and 0 `sorry` inside `Solution.lean` and all 2,259 files of `Breakdown/`.
- **Interactive observatory build:** `_tools/navier-stokes/build_atlas.py` parses every `.lean` module in `lean/` at commit `ad53419`, extracts all 6,570 real in-repo `import` edges, partitions the 2,270 modules into 12 radial libraries and 95 semantic prefix-family clusters ordered radially by topological distance from `Solution.lean`, computes the transitive-reduced inner spine of 116 verified declarations and 265 dependency arcs, and fetches full verbatim `.lean` files on demand from GitHub raw.

[Atlas dataset (JSON)]({{ '/assets/data/navier-stokes/atlas.json' | relative_url }})

</details>
