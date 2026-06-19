---
layout: post
title: "The Line Carries an Error Ledger"
description: "Bresenham line drawing is not just old graphics lore. It is an incremental proof that one integer error term can choose adjacent pixels without multiplication or division in the loop."
date: 2026-06-18 08:00:00 -0400
categories: computer-science
tags: [bresenham, rasterization, computer-graphics, integer-arithmetic, algorithms, visualization]
excerpt: "A raster line has to pay for a real slope with integer moves. Bresenham's algorithm keeps the debt in one error variable and spends it only when the next pixel must step sideways."
---

A line on a screen is a negotiation.

The mathematical line can pass between pixels. The raster device cannot. It can
only light cells, one after another, while trying not to drift too far from the
ideal segment.

Bresenham's line algorithm is the clean version of that negotiation. It keeps an
integer error term, emits one adjacent pixel at a time, and updates the error by
addition. No floating slope needs to be recomputed inside the loop.

Jack Bresenham's 1965 IBM Systems Journal paper was written for a digital
plotter whose head could move to any of eight neighboring mesh points. The paper
gives an algorithm for controlling that plotter efficiently, with no
multiplication or division in the step loop.[^bresenham] That hardware setting
is old. The idea is still modern: carry the rounding debt explicitly.

## The Midpoint Question

Start with the easy octant:

```text
x increases by 1 every step
0 <= dy <= dx
y either stays put or increases by 1
```

At column `x + 1`, there are two candidates:

```text
E   = (x + 1, y)
NE  = (x + 1, y + 1)
```

The real line crosses somewhere between them. The midpoint test asks whether
the true line is above or below the halfway mark between `E` and `NE`. Instead
of evaluating the line equation with fractions every time, scale the decision
by `2*dx` and keep an integer:

```text
D0 = 2*dy - dx

if D >= 0:
    choose NE
    D += 2*(dy - dx)
else:
    choose E
    D += 2*dy
```

The recurrence is doing bookkeeping. If the line has been running above the
chosen pixels, the debt grows until the next step must move in `y`. If the line
has been running below, the debt shrinks.

For the other seven octants, swap axes and signs. The version in the lab uses
the common symmetric form:

```text
dx = abs(x1 - x0)
dy = abs(y1 - y0)
sx = sign(x1 - x0)
sy = sign(y1 - y0)
err = dx - dy

repeat:
    emit (x, y)
    e2 = 2*err
    if e2 > -dy:
        err -= dy
        x += sx
    if e2 < dx:
        err += dx
        y += sy
```

That code looks almost too small, but it is carrying the octant cases in `sx`,
`sy`, and the two comparisons.

## Lab: Watch The Debt Move

The lab draws the ideal real line in orange and the emitted raster pixels in
blue. The red pixel is the current step. The error plot shows the minor-axis
deviation staying inside half a cell. The ledger shows the integer `err`, the
doubled decision variable `2e`, and whether the next pulse moves in `x`, `y`,
or both.

<style>
  .bres-line-lab {
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

  .bres-line-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin-bottom: 1rem;
  }

  .bres-line-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .bres-line-lab select,
  .bres-line-lab input {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    box-sizing: border-box;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.48rem 0.52rem;
    width: 100%;
  }

  .bres-line-lab input {
    accent-color: #0f766e;
    padding: 0;
  }

  .bres-line-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .bres-line-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin-bottom: 0.85rem;
  }

  .bres-line-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    min-width: 0;
    padding: 0.62rem 0.68rem;
  }

  .bres-line-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .bres-line-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.24rem;
  }

  .bres-line-lab__metric--good strong {
    color: #0f766e;
  }

  .bres-line-lab__metric--bad strong {
    color: #be123c;
  }

  .bres-line-lab canvas {
    aspect-ratio: 980 / 680;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: 760px;
    width: 100%;
  }

  .bres-line-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .bres-line-lab {
      padding: 0.85rem;
    }

    .bres-line-lab canvas {
      aspect-ratio: 430 / 780;
      max-height: none;
    }
  }
</style>

<div class="bres-line-lab" data-bresenham-line-lab>
  <div class="bres-line-lab__controls">
    <label>
      Segment
      <select data-param="scenario">
        <option value="shallow" selected>shallow down</option>
        <option value="steep">steep up</option>
        <option value="backward">backward climb</option>
        <option value="diagonal">diagonal</option>
        <option value="vertical">vertical</option>
      </select>
    </label>
    <label>
      Step <output data-value="step">12</output>
      <input data-param="step" type="range" min="0" max="24" step="1" value="12">
    </label>
  </div>
  <div class="bres-line-lab__metrics" data-metrics></div>
  <canvas data-canvas width="980" height="680" aria-label="Bresenham line rasterization lab"></canvas>
  <p class="bres-line-lab__note">The lab uses integer endpoints on a small pixel grid. It visualizes aliased line rasterization, not antialiasing, coverage masks, joins, caps, clipping, or subpixel stroke rules.</p>
</div>

<script defer src="{{ '/assets/js/bresenham-line-lab.js?v=20260618c' | relative_url }}"></script>

## What The Audit Checks

The exported Node audit runs five line segments: shallow, steep, backward,
diagonal, and vertical. For each one it verifies:

```text
the first pixel is the requested start
the final pixel is the requested end
successive pixels are adjacent on the 8-neighbor grid
the point count is max(abs(dx), abs(dy)) + 1
the decision trace stores integer err and 2*err values
the minor-axis deviation stays within half a cell
```

For the default segment `(1,13) -> (25,5)`, the script reports:

```text
points:      25
dx / dy:     24 / 8
max error:   0.333
audit:       pass
```

The vertical case is included for a boring reason: boring cases are where
generalized octant code often leaks assumptions. The backward case forces a
negative `x` direction. The steep case swaps the major axis. The exported audit
reports 33 named checks: 30 segment-local invariants plus three cross-scenario
guardrails for the shallow, vertical, and backward cases.

To reproduce those cases from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/bresenham-line-lab.js");
const EXPECTED_CASE_KEYS = [
  "shallow:1,13->25,5:24/8:1/-1:25",
  "steep:4,15->12,1:8/14:1/-1:15",
  "backward:25,3->3,15:22/12:-1/1:23",
  "diagonal:2,3->22,15:20/12:1/1:21",
  "vertical:14,1->14,16:0/15:0/1:16"
];
const EXPECTED_CASE_ROWS = [
  "shallow:1,13->25,5:dx=24:dy=8:sx=1:sy=-1:points=25/25:maxError=0.333:checks=6/6:passed=true",
  "steep:4,15->12,1:dx=8:dy=14:sx=1:sy=-1:points=15/15:maxError=0.429:checks=6/6:passed=true",
  "backward:25,3->3,15:dx=22:dy=12:sx=-1:sy=1:points=23/23:maxError=0.455:checks=6/6:passed=true",
  "diagonal:2,3->22,15:dx=20:dy=12:sx=1:sy=1:points=21/21:maxError=0.400:checks=6/6:passed=true",
  "vertical:14,1->14,16:dx=0:dy=15:sx=0:sy=1:points=16/16:maxError=0.000:checks=6/6:passed=true"
];
const EXPECTED_LOCAL_CHECK_NAMES = [
  "starts at requested endpoint",
  "ends at requested endpoint",
  "one adjacent move per pulse",
  "point count is max delta + 1",
  "integer decision state",
  "half-cell error bound"
];
const EXPECTED_CRITICAL_CHECK_NAMES = [
  "shallow line advances x on step 1",
  "vertical x coordinate stays fixed",
  "backward scenario exercises negative x direction"
];
const EXPECTED_CRITICAL_ROWS = [
  "shallow line advances x on step 1:true",
  "vertical x coordinate stays fixed:true",
  "backward scenario exercises negative x direction:true"
];
const EXPECTED_CASES = EXPECTED_CASE_KEYS.length;
const EXPECTED_CHECKS =
  EXPECTED_CASES * EXPECTED_LOCAL_CHECK_NAMES.length +
  EXPECTED_CRITICAL_CHECK_NAMES.length;

function sameList(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function rowDrifts(actual, expected) {
  const count = Math.max(actual.length, expected.length);
  const drift = [];
  for (let index = 0; index < count; index += 1) {
    if (actual[index] !== expected[index]) {
      drift.push({ index, actual: actual[index], expected: expected[index] });
    }
  }
  return drift;
}

function auditShape(audit) {
  return {
    cases: audit.cases.map(
      (row) => `${row.scenario}:${row.x0},${row.y0}->${row.x1},${row.y1}:` +
        `${row.dx}/${row.dy}:${row.sx}/${row.sy}:${row.points}`
    ),
    caseRows: audit.cases.map(
      (row) => `${row.scenario}:${row.x0},${row.y0}->${row.x1},${row.y1}:` +
        `dx=${row.dx}:dy=${row.dy}:sx=${row.sx}:sy=${row.sy}:` +
        `points=${row.points}/${row.expectedPoints}:` +
        `maxError=${row.maxAxisError.toFixed(3)}:` +
        `checks=${row.passedChecks}/${row.totalChecks}:passed=${row.passed}`
    ),
    localChecksByCase: audit.cases.map(
      (row) => row.checks.map((check) => check.name)
    ),
    criticalChecks: audit.criticalChecks.map((row) => row.name),
    criticalRows: audit.criticalChecks.map((row) => `${row.name}:${row.ok}`)
  };
}

const audit = lab.auditBresenhamLineLab();
const shape = auditShape(audit);
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const failedCriticalChecks = audit.criticalChecks.filter((row) => !row.ok);
const caseRowDrifts = rowDrifts(shape.caseRows, EXPECTED_CASE_ROWS);
const criticalRowDrifts = rowDrifts(shape.criticalRows, EXPECTED_CRITICAL_ROWS);
const shapeErrors = [
  sameList(shape.cases, EXPECTED_CASE_KEYS) ? null : "cases",
  caseRowDrifts.length ? "caseRows" : null,
  shape.localChecksByCase.every((checks) => sameList(checks, EXPECTED_LOCAL_CHECK_NAMES))
    ? null
    : "localChecksByCase",
  sameList(shape.criticalChecks, EXPECTED_CRITICAL_CHECK_NAMES) ? null : "criticalChecks",
  criticalRowDrifts.length ? "criticalRows" : null
].filter(Boolean);
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  dx: row.dx,
  dy: row.dy,
  points: `${row.points}/${row.expectedPoints}`,
  maxError: row.maxAxisError.toFixed(3),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
console.table(audit.criticalChecks.map((row) => ({
  check: row.name,
  passed: row.ok
})));
const summary =
  `${audit.passed}/${audit.total} cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  audit.total !== EXPECTED_CASES ||
  audit.totalChecks !== EXPECTED_CHECKS ||
  failed.length ||
  failedCriticalChecks.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    shape,
    drifts: {
      caseRows: caseRowDrifts,
      criticalRows: criticalRowDrifts
    },
    failed,
    failedCriticalChecks,
    errors: audit.errors,
    expectedCases: EXPECTED_CASES,
    expectedChecks: EXPECTED_CHECKS,
    total: audit.total,
    totalChecks: audit.totalChecks
  }, null, 2));
}
console.log(summary);
NODE
```

## Why This Is Not Just Rounding

You can draw a line by evaluating the real equation at every column and
rounding. On modern hardware, that may be perfectly fine. But it hides the
algorithmic shape.

Bresenham's recurrence is not trying to rediscover the slope. It already knows
the slope through `dx` and `dy`. The state variable only answers one local
question:

```text
has the accumulated rounding debt crossed the midpoint?
```

That is why the update is cheap. Each emitted pixel pays a fixed amount of debt
or receives a fixed refund. In the first octant, choosing `E` adds `2*dy`.
Choosing `NE` adds `2*(dy-dx)`. The branch is a sign test.

The lesson generalizes beyond line drawing:

```text
do not recompute the continuous object if a discrete error ledger is enough
```

You see the same flavor in incremental scan conversion, midpoint circle
drawing, digital differential analyzers, and fixed-point timing loops. The
object is continuous; the device is discrete; the algorithm survives by carrying
the mismatch explicitly.

## Where The Contract Ends

Bresenham chooses a one-pixel-wide aliased path. It does not know what a modern
renderer means by a stroke. It does not compute pixel coverage. It does not
antialias. It does not handle joins or caps. It does not decide whether a line
endpoint should be inclusive in a graphics API's fill convention.

Those are different contracts.

The small contract here is still valuable:

```text
given integer endpoints,
emit a connected lattice path,
touch exactly one new major-axis position per pulse,
stay within half a cell of the ideal segment,
use only integer recurrence state in the loop
```

That is why the algorithm still feels sharp. It does not pretend pixels are
real numbers. It keeps a ledger for the rounding error and pays it down one
move at a time.

[^bresenham]: J. E. Bresenham, ["Algorithm for computer control of a digital plotter"](https://dl.acm.org/doi/10.1147/sj.41.0025), *IBM Systems Journal* 4(1), 1965. A public PDF copy is hosted by Ohio State University Pressbooks: [bresenham.pdf](https://ohiostate.pressbooks.pub/app/uploads/sites/45/2017/09/bresenham.pdf).
