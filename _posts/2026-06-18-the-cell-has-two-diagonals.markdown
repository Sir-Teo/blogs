---
layout: post
title: "The Cell Has Two Diagonals"
description: "Marching squares turns a sampled scalar field into contour segments with a 16-case table. Two cases are ambiguous because the corners alone do not say which diagonal the isoline should respect."
date: 2026-06-18 01:20:00 -0400
categories: computer-science
tags: [marching-squares, contouring, visualization, scalar-fields, computational-geometry, computer-graphics]
excerpt: "A contouring cell is a small contract: corner signs choose candidate edges, interpolation locates crossings, and ambiguous diagonal cases need an extra rule."
---

A contour line looks continuous after it is drawn.

The data underneath is usually not continuous. It is a grid of samples:

```text
f[i, j]
```

Marching squares is the little algorithm that stands between those two facts.
It walks cell by cell, asks which corners are above an isovalue, and emits short
line segments where the contour crosses cell edges.

Most cells are boring. Two are not.

## The 16-Case Contract

Take one grid cell with four scalar values:

```text
tl ---- tr
|      |
|      |
bl ---- br
```

For an isovalue $$\alpha$$, each corner becomes a bit:

```text
corner >= alpha  ->  inside
corner <  alpha  ->  outside
```

Four bits create 16 cases. If one corner is inside, the contour enters through
one incident edge and leaves through the other. If two adjacent corners are
inside, the contour crosses the two opposite edges. If all or no corners are
inside, there is no segment inside the cell.

The edge crossing is placed by linear interpolation. On an edge with endpoint
values $$a$$ and $$b$$, the fraction from $$a$$ to $$b$$ is

$$
t = {\alpha-a \over b-a}.
$$

This is the same local recipe that made marching cubes famous in 3D. Lorensen
and Cline's 1987 paper framed the method as a case-table algorithm: classify
cube vertices against a constant density, look up intersected edges, and place
surface vertices with linear interpolation.[^lorensen-cline] Marching squares is
the 2D version of that idea.

But a case table only knows corner signs.

## The Ambiguous Cases

The trouble cases are the diagonals:

```text
case 5:   in  out       case 10:  out in
          out in                  in  out
```

Both have four edge crossings. Both can be connected in two ways:

```text
connect like /        or        connect like \
```

The corner signs alone do not tell you which connection matches the continuous
field inside the cell. A hard-coded diagonal is a topology decision disguised as
a lookup-table entry.

One common repair is to look at the bilinear patch implied by the four samples:

$$
f(x,y)=a+bx+cy+dxy.
$$

That patch agrees with linear interpolation on each cell edge, but it has an
interior shape. The asymptotic-decider idea of Nielson and Hamann was introduced
for marching cubes ambiguity, using the interpolant's asymptotic behavior to
choose a consistent topology.[^nielson-hamann] In two dimensions, the same
principle becomes very visible: inspect the bilinear saddle or center behavior
instead of pretending that a four-bit case number is enough.

## Lab: One Cell Gets A Vote

The lab below implements marching squares on a deterministic scalar field. It
does four things:

- samples a scalar field on an $$n \times n$$ cell grid;
- classifies every cell into one of 16 cases;
- places contour endpoints by edge interpolation;
- resolves cases 5 and 10 with either an asymptotic decider, a fixed diagonal,
  or a simple center-value rule.

The default field is the bilinear saddle

$$
f(x,y)=32(x-0.5)(y-0.5)
$$

with a 17-by-17 cell grid and isovalue `0.01`. That intentionally places the
saddle inside one cell rather than exactly on a grid line. The central cell is
case 5:

| Corner | Value |
| --- | ---: |
| bottom-left | `0.0276816609` |
| bottom-right | `-0.0276816609` |
| top-right | `0.0276816609` |
| top-left | `-0.0276816609` |

The bilinear saddle value is `0`, below the isovalue, so the decider chooses the
low-center branch.

<style>
  .ms-lab {
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
  .ms-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
    margin-bottom: 1rem;
  }
  .ms-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .ms-lab__controls input,
  .ms-lab__controls select {
    accent-color: #0f766e;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .ms-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .ms-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
    margin: 0 0 1rem;
  }
  .ms-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .ms-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .ms-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.04rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .ms-lab__metric--good strong {
    color: #0f766e;
  }
  .ms-lab__metric--bad strong {
    color: #be123c;
  }
  .ms-lab__metric--warn strong {
    color: #b45309;
  }
  .ms-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .ms-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 0.75rem;
  }
  .ms-lab__legend span {
    align-items: center;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .ms-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .ms-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    margin: 0.75rem 0 0;
  }
  @media (max-width: 720px) {
    .ms-lab {
      padding: 0.75rem;
    }
    .ms-lab__controls,
    .ms-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="ms-lab" data-marching-squares-lab>
  <div class="ms-lab__controls">
    <label>
      Field <output data-value="field">bilinear saddle</output>
      <select data-param="field" aria-label="Scalar field">
        <option value="saddle" selected>Bilinear saddle</option>
        <option value="hills">Two hills</option>
        <option value="ring">Soft ring</option>
        <option value="waves">Ripple field</option>
      </select>
    </label>
    <label>
      Isovalue <output data-value="iso">0.01</output>
      <input type="range" data-param="iso" min="-80" max="80" step="1" value="1" aria-label="Isovalue in hundredths">
    </label>
    <label>
      Resolution <output data-value="resolution">17</output>
      <input type="range" data-param="resolution" min="8" max="42" step="1" value="17" aria-label="Grid resolution">
    </label>
    <label>
      Ambiguity rule <output data-value="ambiguity">asymptotic decider</output>
      <select data-param="ambiguity" aria-label="Ambiguous cell rule">
        <option value="decider" selected>Asymptotic decider</option>
        <option value="center">Cell-center sign</option>
        <option value="slash">Always /</option>
        <option value="backslash">Always \</option>
      </select>
    </label>
    <label>
      Noise <output data-value="noise">0.00</output>
      <input type="range" data-param="noise" min="0" max="50" step="1" value="0" aria-label="Deterministic noise">
    </label>
    <label>
      Seed <output data-value="seed">19</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="19" aria-label="Noise seed">
    </label>
  </div>
  <div class="ms-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="720" aria-label="Marching squares lab showing scalar field, contour segments, case histogram, ambiguous cell zoom, and audit ledger"></canvas>
  <div class="ms-lab__legend">
    <span><i style="background:#0f766e"></i>Ordinary contour segment</span>
    <span><i style="background:#7c3aed"></i>Ambiguous-cell segment</span>
    <span><i style="background:#b45309"></i>Case 5 or 10</span>
    <span><i style="background:#f97316"></i>Above isovalue</span>
    <span><i style="background:#38bdf8"></i>Below isovalue</span>
  </div>
  <p class="ms-lab__note" data-note>
    Bilinear saddle at iso 0.01 using asymptotic decider. Cases 5 and 10 are the
    cells where one bit table needs an extra diagonal rule.
  </p>
</div>

<script defer src="{{ '/assets/js/marching-squares-lab.js?v=20260618b' | relative_url }}"></script>

## What The Counts Hide

The default audit row is:

| Field | Rule | Cells | Active cells | Segments | Ambiguous | Decider high/low | Max endpoint residual |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| bilinear saddle | asymptotic decider | 289 | 33 | 34 | 1 | 0 / 1 | `6.4e-17` |

If you switch from **Asymptotic decider** to **Always /** or **Always \\**, the
segment count does not change. That is the trap. The table still emits two
segments for case 5, but it connects a different pair of edges. The metric that
changed is topology, not count.

The broader audit grid checks several fields and rules:

| Field | Rule | Resolution | Cells | Active | Segments | Ambiguous |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| bilinear saddle | asymptotic decider | 17 | 289 | 33 | 34 | 1 |
| bilinear saddle | always / | 17 | 289 | 33 | 34 | 1 |
| bilinear saddle | always `\` | 17 | 289 | 33 | 34 | 1 |
| two hills | asymptotic decider | 24 | 576 | 48 | 48 | 0 |
| soft ring | asymptotic decider | 26 | 676 | 136 | 140 | 4 |
| ripple field | cell-center sign | 22 | 484 | 142 | 142 | 0 |

The exported audit verifies grid dimensions, case histogram accounting,
ambiguous-cell counting, finite segment endpoints, unit-square endpoint bounds,
and that every interpolated endpoint evaluates back to the isovalue within
floating-point tolerance.

To reproduce the deterministic audit grid from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/marching-squares-lab.js");
const audit = lab.auditGrid();
console.table(audit.cases.map((row) => ({
  field: row.field,
  rule: row.ambiguity,
  resolution: row.resolution,
  cells: row.cells,
  active: row.activeCells,
  segments: row.segments,
  ambiguous: row.ambiguous,
  decisions: `${row.highDecisions}/${row.lowDecisions}`,
  residual: row.maxResidual.toExponential(1),
  passed: row.passed
})));
if (audit.passed !== audit.total) {
  throw new Error(`${audit.passed}/${audit.total} audit cases passed`);
}
NODE
```

## The Diagonal Is Not A Styling Choice

The ambiguous cases are sometimes explained as a drawing nuisance. That makes
them sound cosmetic. They are not.

A contour is often used as data:

- a coastline in a map tile;
- a medical boundary on a slice;
- an isobar in a weather field;
- a collision shape;
- a thresholded probability region;
- a mesh cross-section.

In those settings, the diagonal decides connectivity. Two regions may become one
region. One hole may become two holes. A later simplifier or polygonizer will
inherit that decision as if the samples had proved it.

The honest statement is:

```text
the corners identify edge crossings;
the interpolation model chooses the interior topology
```

If the interpolation model is bilinear, the asymptotic decider is a principled
local rule. If the data is categorical, aliased, quantized, or semantically
piecewise-constant, a bilinear rule may be the wrong story. The cell still needs
an extra promise; it is just not always the same promise.

## Sampling Is Not A Shape

Marching squares is local. It does not know whether the real field had a thin
loop entirely inside a cell, a sharp corner between samples, or two features
that crossed between grid lines. No diagonal rule can recover information that
was never sampled.

That limitation is not a failure of the algorithm. It is the sampling contract
coming due. The method can be exact for the piecewise interpolation model you
chose; it cannot certify the unsampled world behind the grid.

When I see a contouring system in production, I want four answers:

- What interpolation model is the contour claiming?
- How are cases 5 and 10 resolved?
- Are equality cases handled deterministically?
- Are topology-sensitive downstream steps tested under grid shifts and
  isovalue perturbations?

A contour line is not just ink. It is a sequence of local topology decisions.
Most cells have one obvious crossing. Some cells have two diagonals, and the
code has to admit which one it chose.

## Sources

[^lorensen-cline]: William E. Lorensen and Harvey E. Cline, ["Marching Cubes: A High Resolution 3D Surface Construction Algorithm"](https://www.cs.toronto.edu/~jacobson/seminar/lorenson-and-cline-1987.pdf), *Computer Graphics* 21(4), SIGGRAPH 1987. The paper presents a case-table method for constant-density surfaces, scan-line processing, and linear interpolation of edge intersections.

[^nielson-hamann]: Gregory M. Nielson and Bernd Hamann, ["The Asymptotic Decider: Resolving the Ambiguity in Marching Cubes"](https://graphics.stanford.edu/courses/cs164-10-spring/Handouts/paper_p83-nielson.pdf), IEEE Visualization 1991. The method addresses ambiguous marching-cubes topology by using the interpolation behavior inside the cell rather than only the vertex sign pattern.
