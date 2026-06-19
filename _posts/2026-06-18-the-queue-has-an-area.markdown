---
layout: post
title: "The Queue Has an Area"
description: "Little's Law is not a magic queueing formula. It is an accounting identity over the right observation window, and cropped logs can quietly lose the boundary terms."
date: 2026-06-18 06:00:00 -0400
categories: computer-science
tags: [queueing, littles-law, performance, systems, statistics, operations-research]
excerpt: "Draw the number of jobs in a system over time. The area under that step function is the residence-time ledger. Little's Law is what happens when that ledger is measured on the right window."
---

A queue is usually drawn as a line of jobs waiting for a server.

That picture is useful, but it hides the object that Little's Law is really
about. Draw the queue as a function of time instead:

$$
N(t) = \text{number of jobs in the system at time } t.
$$

Now the queue has an area.

Every job contributes one horizontal strip to that area, starting when it enters
the system and ending when it leaves. If job $$i$$ arrives at $$a_i$$ and departs
at $$d_i$$, its strip has width $$d_i-a_i$$. Stack all the strips and you get the
area under the step function:

$$
\int_0^T N(t)\,dt.
$$

This is the small accounting fact that makes Little's Law feel less like a
queueing-theory spell:

$$
\text{area under occupancy}
=
\text{sum of residence times}.
$$

When the observation starts empty and ends empty, with $$n$$ completed jobs in a
window of length $$T$$, the algebra is almost embarrassingly short:

$$
L = \frac{1}{T}\int_0^T N(t)\,dt,
\qquad
\lambda = \frac{n}{T},
\qquad
W = \frac{1}{n}\sum_{i=1}^n (d_i-a_i).
$$

Because the integral equals the sum,

$$
L
=
\frac{1}{T}\sum_{i=1}^n(d_i-a_i)
=
\frac{n}{T}\cdot\frac{1}{n}\sum_{i=1}^n(d_i-a_i)
=
\lambda W.
$$

No exponential service times. No Poisson arrivals. No FIFO assumption. For this
finite empty-to-empty experiment, the result is just a conserved area.

Little's 1961 proof gave the stochastic stationary theorem under broad
conditions.[^little-1961] Stidham later gave a direct sample-path proof using
weaker, deterministic-looking hypotheses on limiting averages.[^stidham] The
later literature extends the relation in several directions; Whitt's review is
a useful map of those variants, and Little's 2011 retrospective is a good guide
to the theorem's operational uses.[^whitt][^little-2011] The
practical lesson is less formal but very sharp: if your measurements do not
cover the same area, rate, and residence-time ledger, the equation can look
wrong for reasons you created.

## The Lab: Cut the Log, Lose the Edge

The simulator below is a single-server queue with configurable arrival burstiness
and service variability. The default view is intentionally a cropped production
log slice. Some jobs were already in the system when the clock started. Some are
still present when the clock stops.

The green step plot is $$N(t)$$. The stacked bar underneath is the exact
residence-time ledger inside the visible window:

$$
\int_s^t N(u)\,du
=
\sum_i \left|[a_i,d_i)\cap[s,t]\right|.
$$

The blue outline is the tempting shortcut: count only jobs that both arrive and
depart inside the window, then compute $$\lambda W$$ from those closed jobs.
Switch the observation mode to "empty-to-empty drain" and the shortcut becomes
exact. Switch back to a cropped slice and the missing edge terms appear.

<style>
  .little-law-lab {
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

  .little-law-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
    margin-bottom: 1rem;
  }

  .little-law-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .little-law-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .little-law-lab input[type="range"],
  .little-law-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .little-law-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
  }

  .little-law-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .little-law-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .little-law-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .little-law-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .little-law-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .little-law-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .little-law-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .little-law-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .little-law-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .little-law-lab {
      padding: 0.75rem;
    }

    .little-law-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="littles-law-lab" class="little-law-lab" data-littles-law-lab>
  <div class="little-law-lab__controls">
    <label>
      Offered load: <output data-value="load">82%</output>
      <input type="range" min="35" max="98" step="1" value="82" data-param="load">
    </label>
    <label>
      Mean service: <output data-value="meanServiceMs">52 ms</output>
      <input type="range" min="18" max="120" step="1" value="52" data-param="meanServiceMs">
    </label>
    <label>
      Arrival CV: <output data-value="arrivalCv">100%</output>
      <input type="range" min="0" max="180" step="5" value="100" data-param="arrivalCv">
    </label>
    <label>
      Service CV: <output data-value="serviceCv">100%</output>
      <input type="range" min="0" max="180" step="5" value="100" data-param="serviceCv">
    </label>
    <label>
      Window length: <output data-value="windowSec">18 s</output>
      <input type="range" min="8" max="40" step="1" value="18" data-param="windowSec">
    </label>
    <label>
      Observation:
      <select data-param="mode">
        <option value="slice" selected>cropped log slice</option>
        <option value="drain">empty-to-empty drain</option>
      </select>
    </label>
    <label>
      Seed: <output data-value="seed">170</output>
      <input type="range" min="1" max="999" step="1" value="170" data-param="seed">
    </label>
  </div>
  <div class="little-law-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Little's Law simulator showing the area under jobs in system and the missing boundary terms in a cropped log window"></canvas>
  <div class="little-law-lab__legend">
    <span><i style="background:#0f766e"></i> Occupancy area</span>
    <span><i style="background:#2563eb"></i> Closed jobs</span>
    <span><i style="background:#7c3aed"></i> Left edge</span>
    <span><i style="background:#b45309"></i> Right edge</span>
    <span><i style="background:#be123c"></i> Spans window</span>
  </div>
  <p class="little-law-lab__note">
    Deterministic synthetic experiment. Interarrival and service times are
    lognormal with the selected means and coefficients of variation. The area
    under the step function is integrated exactly from event times; no sampling
    grid is used for the identity check.
  </p>
</div>
<script defer src="{{ '/assets/js/littles-law-lab.js?v=20260618c' | relative_url }}"></script>

The default settings usually show a positive edge debt. That is not a violation
of Little's Law. It is a bookkeeping error in the shortcut.

The exact finite-window statement is the intersection formula:

$$
A(s,t)
=
\int_s^t N(u)\,du
=
\sum_i \left|[a_i,d_i)\cap[s,t]\right|.
$$

The completed-only product is only this part:

$$
\widehat L_\text{closed}
=
\frac{1}{t-s}
\sum_{i: s\le a_i<d_i\le t}(d_i-a_i).
$$

It drops jobs already present at $$s$$ and jobs still present at $$t$$. In a
short window, a high-variance service distribution, or a system near saturation,
those boundary rectangles can be a large fraction of the area.

Kim and Whitt make this point in a statistical setting: real applications of
Little's Law use finite-time measurements, not infinite limits or perfectly
stationary expectations, so interval edge effects and confidence intervals have
to be treated as part of the measurement problem.[^kim-whitt]

## What the Equation Does Not Buy You

Little's Law is a constraint, not a performance model.

If you know the long-run throughput and average residence time, it tells you the
average number in the system. If you know average occupancy and throughput, it
tells you average residence time. It does not tell you which service discipline
created that residence time, whether the p99 is survivable, or what happens if
the next burst arrives.

That distinction matters in systems work. A dashboard might say:

```text
work in progress: 240 requests
throughput:        80 requests / second
```

If the measurements are consistent and the system is not drifting, the implied
mean time in system is about three seconds. But the equation did not discover
why. The cause could be slow service, queueing behind a saturated server, locks,
retry amplification, rate limiting, downstream backpressure, or a measurement
window that mixed several regimes.

Nor does the equation license offered load as $$\lambda$$. In a lossy system,
the arrival rate offered to the front door can differ from the effective rate
that enters the measured system. If admission control rejects half the requests,
using offered arrivals with the residence time of admitted requests crosses two
different populations.

The word "system" is doing real work. You can apply Little's Law to:

- the waiting room only;
- the server only;
- queue plus service;
- one shard;
- one tenant;
- one retry attempt;
- all attempts belonging to one user-visible request.

Each boundary has its own $$N(t)$$, $$\lambda$$, and $$W$$. Mixing boundaries is
how a conservation law becomes a dashboard superstition.

## A Useful Measurement Contract

For an operational service, I would rather see Little's Law used as an audit than
as a slogan. Pick a boundary and a time window, then ask whether the three
measurements describe the same population.

- Count occupancy by integrating queue depth or in-flight work over time.
- Measure throughput over the same window and the same boundary.
- Measure residence time for the same jobs, not a sampled subset with a
  different clock.
- Report whether the window starts and ends empty, or account for boundary
  work explicitly.
- Separate waiting time from service time when the remedy depends on the phase.
- Use effective arrivals for admitted work; report rejected, timed out,
  canceled, and retried work separately.
- Slice by route, tenant, shard, priority, or job class before averaging hides
  the queue that hurts.
- Treat short windows as estimates with uncertainty, not as laws of nature.

The lab exports the same audit:

```bash
node - <<'NODE'
const lab = require("./assets/js/littles-law-lab.js");
const EXPECTED_GRID_SHAPE = [
  "modes=drain/slice",
  "loads=45/72/93",
  "arrivalCv=0/80/160",
  "serviceCv=0/90/150",
  "seeds=3/41"
];
const EXPECTED_MODE_SHAPE = [
  "drain:cases=54:passed=54:checks=702/702:meanEdgeDebt=0.000000:open=0/0:maxResidual=0.000000000000",
  "slice:cases=54:passed=54:checks=594/594:meanEdgeDebt=0.158744:open=191/249:maxResidual=0.000000000000"
];
const EXPECTED_LOAD_SHAPE = [
  "45:cases=36:passed=36:checks=432/432:meanEdgeDebt=0.004781:open=13/13:maxResidual=0.000000000000",
  "72:cases=36:passed=36:checks=432/432:meanEdgeDebt=0.020383:open=29/56:maxResidual=0.000000000000",
  "93:cases=36:passed=36:checks=432/432:meanEdgeDebt=0.212952:open=149/180:maxResidual=0.000000000000"
];
const EXPECTED_WORST_RESIDUAL_SHAPE = [
  "drain:93:160:0:3:residual=0.000000000000:edgeDebt=-0.000000:13/13:true",
  "slice:93:80:150:3:residual=0.000000000000:edgeDebt=1.119933:11/11:true",
  "slice:93:80:150:41:residual=0.000000000000:edgeDebt=0.489341:11/11:true",
  "slice:93:80:90:3:residual=0.000000000000:edgeDebt=0.355634:11/11:true",
  "drain:93:160:90:3:residual=0.000000000000:edgeDebt=0.000000:13/13:true",
  "slice:93:0:90:41:residual=0.000000000000:edgeDebt=0.178910:11/11:true"
];
const EXPECTED_CHECK_NAMES = [
  "area equals residence-time ledger",
  "area is finite and nonnegative",
  "closed lambda-W product matches closed rate times mean W",
  "drain closes all rectangles",
  "drain ends empty",
  "drain starts empty",
  "edge debt is nonnegative",
  "ledger components sum to total",
  "max queue length bounds endpoints",
  "queue length stays nonnegative",
  "slice edge debt equals boundary rectangles",
  "time-average L equals area divided by window",
  "time-average L splits into closed product plus edge debt",
  "window is finite and positive"
];
const EXPECTED_COMMON_CHECKS = [
  { name: "area is finite and nonnegative", ok: true },
  { name: "window is finite and positive", ok: true },
  { name: "area equals residence-time ledger", ok: true },
  { name: "ledger components sum to total", ok: true },
  { name: "time-average L splits into closed product plus edge debt", ok: true },
  { name: "closed lambda-W product matches closed rate times mean W", ok: true },
  { name: "time-average L equals area divided by window", ok: true },
  { name: "queue length stays nonnegative", ok: true },
  { name: "max queue length bounds endpoints", ok: true },
  { name: "edge debt is nonnegative", ok: true }
];
const EXPECTED_CHECKS_BY_MODE = {
  drain: EXPECTED_COMMON_CHECKS.concat([
    { name: "drain closes all rectangles", ok: true },
    { name: "drain starts empty", ok: true },
    { name: "drain ends empty", ok: true }
  ]),
  slice: EXPECTED_COMMON_CHECKS.concat([
    { name: "slice edge debt equals boundary rectangles", ok: true }
  ])
};
const EXPECTED_MODES = EXPECTED_MODE_SHAPE.length;
const EXPECTED_LOADS = EXPECTED_LOAD_SHAPE.length;
const EXPECTED_CASES = 2 * 3 * 3 * 3 * 2;
const EXPECTED_CHECKS = 1296;
const EXPECTED_MAX_RESIDUAL = "0.000000000000";

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function fixed(value, digits) {
  return Number(value).toFixed(digits);
}

function groupShape(row, key) {
  return `${row[key]}:cases=${row.cases}:passed=${row.passed}:` +
    `checks=${row.passedChecks}/${row.totalChecks}:` +
    `meanEdgeDebt=${fixed(row.meanEdgeDebt, 6)}:` +
    `open=${row.openAtStart}/${row.openAtEnd}:` +
    `maxResidual=${fixed(row.maxResidual, 12)}`;
}

function residualShape(row) {
  return `${row.mode}:${row.load}:${row.arrivalCv}:${row.serviceCv}:${row.seed}:` +
    `residual=${fixed(row.residual, 12)}:edgeDebt=${fixed(row.edgeDebt, 6)}:` +
    `${row.checks}:${row.passed}`;
}

function uniqueNumbers(audit, key) {
  return Array.from(new Set(audit.cases.map((row) => row[key]))).join("/");
}

const audit = lab.audit();
console.table(audit.byMode);
console.table(audit.byLoad);
console.table(audit.worstResiduals);
const shape = {
  byLoad: audit.byLoad.map((row) => groupShape(row, "load")),
  byMode: audit.byMode.map((row) => groupShape(row, "mode")),
  checkNames: Array.from(new Set(audit.cases.flatMap(
    (row) => row.checks.map((check) => check.name)
  ))).sort(),
  grid: [
    `modes=${uniqueNumbers(audit, "mode")}`,
    `loads=${uniqueNumbers(audit, "load")}`,
    `arrivalCv=${uniqueNumbers(audit, "arrivalCv")}`,
    `serviceCv=${uniqueNumbers(audit, "serviceCv")}`,
    `seeds=${uniqueNumbers(audit, "seed")}`
  ],
  maxResidual: fixed(audit.maxResidual, 12),
  worstResiduals: audit.worstResiduals.map(residualShape)
};
const checkRowDrifts = audit.cases.map((row) => ({
  key: `${row.mode}/${row.load}/${row.arrivalCv}/${row.serviceCv}/${row.seed}`,
  checks: row.checks.map((check) => ({
    name: check.name,
    ok: check.ok
  })),
  expected: EXPECTED_CHECKS_BY_MODE[row.mode]
})).filter((row) => !sameJson(row.checks, row.expected));
const shapeErrors = [];
if (!sameList(shape.grid, EXPECTED_GRID_SHAPE)) {
  shapeErrors.push({ name: "grid", actual: shape.grid, expected: EXPECTED_GRID_SHAPE });
}
if (!sameList(shape.byMode, EXPECTED_MODE_SHAPE)) {
  shapeErrors.push({ name: "byMode", actual: shape.byMode, expected: EXPECTED_MODE_SHAPE });
}
if (!sameList(shape.byLoad, EXPECTED_LOAD_SHAPE)) {
  shapeErrors.push({ name: "byLoad", actual: shape.byLoad, expected: EXPECTED_LOAD_SHAPE });
}
if (!sameList(shape.worstResiduals, EXPECTED_WORST_RESIDUAL_SHAPE)) {
  shapeErrors.push({
    name: "worstResiduals",
    actual: shape.worstResiduals,
    expected: EXPECTED_WORST_RESIDUAL_SHAPE
  });
}
if (!sameList(shape.checkNames, EXPECTED_CHECK_NAMES)) {
  shapeErrors.push({
    name: "checkNames",
    actual: shape.checkNames,
    expected: EXPECTED_CHECK_NAMES
  });
}
if (shape.maxResidual !== EXPECTED_MAX_RESIDUAL) {
  shapeErrors.push({
    name: "maxResidual",
    actual: shape.maxResidual,
    expected: EXPECTED_MAX_RESIDUAL
  });
}
if (checkRowDrifts.length) {
  shapeErrors.push({
    name: "checkRows",
    actual: checkRowDrifts.slice(0, 10),
    expected: EXPECTED_CHECKS_BY_MODE
  });
}

const failedModeGroups = audit.byMode.filter(
  (row) => row.passed !== row.cases || row.passedChecks !== row.totalChecks
);
const failedLoadGroups = audit.byLoad.filter(
  (row) => row.passed !== row.cases || row.passedChecks !== row.totalChecks
);
const failedCases = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
if (shapeErrors.length ||
    !audit.ok ||
    !audit.pass ||
    audit.byMode.length !== EXPECTED_MODES ||
    audit.byLoad.length !== EXPECTED_LOADS ||
    audit.cases.length !== EXPECTED_CASES ||
    audit.caseCount !== EXPECTED_CASES ||
    audit.total !== EXPECTED_CASES ||
    audit.totalChecks !== EXPECTED_CHECKS ||
    failedModeGroups.length ||
    failedLoadGroups.length ||
    failedCases.length ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify({
    shapeErrors,
    failures: audit.failures,
    failedModeGroups,
    failedLoadGroups,
    failedCases: failedCases.slice(0, 10),
    totals: {
      caseCount: audit.caseCount,
      rows: audit.cases.length,
      passed: audit.passed,
      passedChecks: audit.passedChecks,
      total: audit.total,
      totalChecks: audit.totalChecks
    }
  }, null, 2));
}
console.log(
  `${audit.passed}/${audit.total} cases and ` +
  `${audit.passedChecks}/${audit.totalChecks} checks passed; ` +
  `max residual ${audit.maxResidual}`
);
NODE
```

The check is deliberately mundane. The current grid runs 108 deterministic
simulations and passes 1296 named checks. It integrates the step function
exactly, sums the residence-time intersections, verifies that the residual is
numerical noise, checks that the ledger components sum back to the whole window,
and confirms that $$L$$ splits into completed-job $$\lambda W$$ plus boundary
debt. In empty-to-empty mode it also checks that the closed-job ledger equals
the whole area and that the window starts and ends empty.

That is the right level of romance for a queue. The theorem is beautiful because
the accounting is unforgiving. Jobs can wait in strange orders, arrive in bursts,
and take variable service times. But once you draw the system boundary and the
time window, the area has to go somewhere.

## Further Reading

[^little-1961]: John D. C. Little, ["A Proof for the Queuing Formula: L = lambda W"](https://doi.org/10.1287/opre.9.3.383), *Operations Research*, 1961. Bibliographic record via [IDEAS/RePEc](https://ideas.repec.org/a/inm/oropre/v9y1961i3p383-387.html).

[^stidham]: Shaler Stidham Jr., ["A Last Word on L = lambda W"](https://doi.org/10.1287/opre.22.2.417), *Operations Research*, 1974. The paper gives a direct proof using limiting averages; see also Karl Sigman's sample-path notes, ["Notes on Little's Law"](https://www.columbia.edu/~ks20/stochastic-I/stochastic-I-LL.pdf), for an accessible area-under-the-path derivation.

[^kim-whitt]: Song-Hee Kim and Ward Whitt, ["Statistical Analysis with Little's Law"](https://doi.org/10.1287/opre.2013.1193), *Operations Research*, 2013. The abstract emphasizes finite-time measurements, edge-effect bias, and confidence intervals. A PDF is available from [Columbia](https://www.columbia.edu/~ww2040/LL_OR.pdf).

[^whitt]: Ward Whitt, ["A review of L = lambda W and extensions"](https://link.springer.com/article/10.1007/BF01158466), *Queueing Systems*, 1991.

[^little-2011]: John D. C. Little, ["Little's Law as Viewed on Its 50th Anniversary"](https://doi.org/10.1287/opre.1110.0940), *Operations Research*, 2011. The retrospective discusses the theorem's development and practical use in operations management and computer architecture.
