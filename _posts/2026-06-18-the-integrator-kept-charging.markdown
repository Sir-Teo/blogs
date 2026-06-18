---
layout: post
title: "The Integrator Kept Charging"
description: "A PI controller with a saturated actuator can keep accumulating error after more command can no longer help. Anti-windup is bookkeeping for that hidden accumulator."
date: 2026-06-18 01:39:00 -0400
categories: control-systems
tags: [pid-control, anti-windup, feedback-control, saturation, simulation, control-systems]
excerpt: "Integral action fixes steady-state error, but a saturated actuator can turn the integral term into stale debt."
---

Integral action is one of the great practical hacks in feedback control.

If the output sits below the target, keep adding corrective pressure. If the
output sits above the target, keep subtracting. A proportional controller can
leave a steady offset; an integrator keeps a ledger.

The problem is that actuators have limits.

Once a valve is fully open, a motor drive is pegged, or a service has hit its
rate cap, asking for more no longer changes the plant input. The controller's
internal integral term may still keep charging. When the target later becomes
reachable again, the actuator can remain pinned while the old integral debt
unwinds.

That is integrator windup.

## The Three Signals

Write a simple PI controller as

$$
v(t) = K_p e(t) + I(t),
$$

where $$e(t)=r(t)-y(t)$$ is tracking error, $$v(t)$$ is the controller's desired
command, and $$I(t)$$ is the integral contribution.

The plant does not receive $$v(t)$$. It receives the actuator output

$$
u(t) = \operatorname{sat}(v(t), -U, U).
$$

When $$v(t)=u(t)$$, the controller's mental model and the actuator agree. When
they differ, the controller is asking for something the plant cannot receive.

Ziegler and Nichols' 1942 paper named and organized the familiar proportional,
automatic-reset, and pre-act control effects for practical controller tuning.[^zn]
Modern PID controllers still carry those terms in more mathematical clothes.
The anti-windup question is not whether integral action is useful. It is what
the integral term should do while the actuator is lying at a hard limit.

## Three Update Rules

The lab below compares three PI variants on the same first-order plant:

$$
\dot y(t) = {u(t-d)-y(t) \over \tau}.
$$

The default parameters are:

- plant time constant `tau = 3`;
- input delay `d = 0.6`;
- actuator limit `U = 1`;
- high target `1.5`, which is unreachable under that limit;
- later target `0.45`, which is reachable.

All three controllers use the same proportional and integral gains. Only the
integral update changes.

**No anti-windup:**

$$
\dot I = K_i e.
$$

This is clean in a linear model and dangerous under saturation.

**Conditional integration:**

$$
\dot I =
\begin{cases}
0, & \text{if saturated and error pushes farther into saturation},\\
K_i e, & \text{otherwise}.
\end{cases}
$$

MIT's feedback-control notes describe this intuition directly: once the input
saturates, stop integrating the error because the actuator cannot do much more
with it.[^mit]

**Back-calculation:**

$$
\dot I = K_i e + K_b(u-v).
$$

The extra term feeds back the gap between what the controller wanted and what the
actuator actually delivered. Astrom and Rundqwist's 1989 anti-windup paper
unified several practical windup-protection ideas around this kind of tracking
view.[^astrom] MathWorks' PID documentation describes back-calculation as an
internal loop that unwinds the integrator during saturation, and clamping as
conditional integration.[^mathworks]

## Lab: Saturate, Then Drop

The experiment is intentionally unfair to the plain PI controller. The target
steps from `0` to `1.5` at `t = 4s`, even though the actuator can only supply
`+1.0`. At `t = 28s`, the target drops to `0.45`, which is reachable.

The interesting question is what happens immediately after the drop.

<style>
  .pid-windup-lab {
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
  .pid-windup-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    margin-bottom: 1rem;
  }
  .pid-windup-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .pid-windup-lab__controls input {
    accent-color: #0f766e;
    color: #172026;
    min-width: 0;
  }
  .pid-windup-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .pid-windup-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin-bottom: 1rem;
  }
  .pid-windup-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .pid-windup-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .pid-windup-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.2rem;
  }
  .pid-windup-lab__metric--good strong {
    color: #0f766e;
  }
  .pid-windup-lab__metric--bad strong {
    color: #be123c;
  }
  .pid-windup-lab canvas {
    aspect-ratio: 940 / 670;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .pid-windup-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78rem;
    font-weight: 700;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .pid-windup-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }
  .pid-windup-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  .pid-windup-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
</style>

<div class="pid-windup-lab" data-pid-windup-lab>
  <div class="pid-windup-lab__controls">
    <label>
      High target <output data-value="high">1.50</output>
      <input type="range" data-param="high" min="80" max="180" step="1" value="150" aria-label="High setpoint">
    </label>
    <label>
      Actuator limit <output data-value="limit">1.00</output>
      <input type="range" data-param="limit" min="60" max="120" step="1" value="100" aria-label="Actuator saturation limit">
    </label>
    <label>
      Proportional gain <output data-value="kp">1.40</output>
      <input type="range" data-param="kp" min="40" max="240" step="1" value="140" aria-label="Proportional gain">
    </label>
    <label>
      Integral gain <output data-value="ki">0.45</output>
      <input type="range" data-param="ki" min="0" max="100" step="1" value="45" aria-label="Integral gain">
    </label>
    <label>
      Back-calc gain <output data-value="kb">0.70</output>
      <input type="range" data-param="kb" min="0" max="160" step="1" value="70" aria-label="Back-calculation gain">
    </label>
  </div>
  <div class="pid-windup-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="670" aria-label="PI integrator windup simulator comparing plain integration, conditional integration, and back-calculation"></canvas>
  <div class="pid-windup-lab__legend">
    <span><i style="background:#be123c"></i>No anti-windup</span>
    <span><i style="background:#2563eb"></i>Conditional integration</span>
    <span><i style="background:#0f766e"></i>Back-calculation</span>
    <span><i style="background:#b45309"></i>Actuator limit</span>
  </div>
  <p class="pid-windup-lab__note" data-note>
    The high request is 1.50 with actuator limit +/-1.00. After the drop, plain
    PI takes 21.2s to leave saturation; back-calculation takes 0.0s.
  </p>
</div>

<script defer src="{{ '/assets/js/pid-windup-lab.js?v=20260618c' | relative_url }}"></script>

## What The Default Run Measures

On the default run, the high target is impossible to hold. The controller can ask
for more than `+1`, but the plant only receives `+1`.

After the target drops to `0.45`, the audit reports:

| Mode | Time to leave saturation after drop | Settling time after drop | Error area after drop | Max absolute integral |
| --- | ---: | ---: | ---: | ---: |
| no anti-windup | `21.2s` | `>32s` | `14.45` | `7.02` |
| conditional integration | `0.0s` | `12.5s` | `1.67` | `0.45` |
| back-calculation | `0.0s` | `10.3s` | `1.20` | `0.62` |

The plain integrator is not "more determined." It is stale. Its hidden state was
charged during a period when the plant input could not increase. When the target
falls, the raw command remains above the actuator limit for another `21.2s`.

The two anti-windup variants disagree in detail. Conditional integration freezes
the integral when the error is pushing farther into saturation. Back-calculation
actively tracks the actuator by feeding back $$u-v$$. In this default scenario,
back-calculation has the smaller post-drop error area, while clamping keeps a
smaller maximum integral. That is a real tradeoff, not a universal ranking.

## Why The Integrator Is A State Variable

The tempting wrong explanation is:

> The proportional term is too high.

Sometimes it is. But in this experiment, changing only the integrator update rule
changes the recovery behavior dramatically. The plant, proportional gain,
integral gain, actuator limit, delay, and setpoint schedule all stay fixed.

The difference lives in a hidden state.

During saturation, the plant sees

$$
u(t)=U,
$$

even if the raw controller command is

$$
v(t)=7U.
$$

The extra `6U` is not extra actuation. It is only an internal promise. If the
integrator keeps accumulating error while that promise cannot be cashed, the
controller must later work off the promise before it can respond normally.

Anti-windup is therefore not a cosmetic clamp on the final output. It is a rule
for keeping the controller's internal state close to the actuator reality.

## Engineering Notes

The lab is deliberately simple. It uses a first-order plant, fixed time step
Euler integration, a small input delay implemented as a queue, and symmetric
input saturation. The exported audit checks finite samples, actuator bounds,
post-drop error area, integral growth, and settlement for the two anti-windup
modes across several parameter sets. The parameter sweep below reports 90 named
checks: 18 invariants for each of five saturated step/drop scenarios.

To reproduce that parameter sweep from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/pid-windup-lab.js");
const EXPECTED_CASES = 5;
const EXPECTED_CHECKS = 90;
const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const seconds = (value) => value == null ? ">32" : value.toFixed(1);
if (audit.total !== EXPECTED_CASES || audit.totalChecks !== EXPECTED_CHECKS) {
  throw new Error(
    `unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`
  );
}
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  failed.length ||
  !audit.ok ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(`${summary}: ${JSON.stringify(failed, null, 2)}`);
}
console.table(audit.cases.map((row) => ({
  case: row.caseId,
  high: row.high.toFixed(2),
  limit: row.limit.toFixed(2),
  noneIAE: row.noneIaeAfterDrop.toFixed(2),
  clampIAE: row.clampIaeAfterDrop.toFixed(2),
  backcalcIAE: row.backcalcIaeAfterDrop.toFixed(2),
  noneReentry: seconds(row.noneReentryTime),
  backcalcReentry: seconds(row.backcalcReentryTime),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
console.log(summary);
NODE
```

It does not prove stability for arbitrary nonlinear plants. It does not tune a
PID controller. It does not model derivative filtering, sensor noise, quantized
actuators, actuator dynamics, or cascaded loops. MathWorks' documentation calls
out that more complex industrial scenarios may require tracking the effective
actuator contribution rather than assuming the PID output is the only signal
feeding the actuator.[^mathworks]

The small lesson survives those caveats:

> If the actuator is saturated, the controller output is no longer the plant
> input. A PI controller that ignores that fact can store old error as future
> delay.

The integrator is a memory. Give it truthful feedback.

## Sources

[^zn]: J. G. Ziegler and N. B. Nichols, ["Optimum Settings for Automatic Controllers"](https://davidr.no/iiav3017/papers/Ziegler_Nichols_%201942.pdf), *Transactions of the ASME* 64, 1942. The paper identifies proportional response, automatic reset, and pre-act as the three principal control effects in practical controllers.

[^mit]: MIT OpenCourseWare, ["16.30 Feedback Control Systems, Topic 23: Anti-windup"](https://ocw.mit.edu/courses/16-30-feedback-control-systems-fall-2010/8c33eb306938cac6cd73e701a86a5b32_MIT16_30F10_lec23.pdf), Fall 2010. The notes describe integrator windup under saturation and give conditional integration and actuator-error feedback as anti-windup options.

[^astrom]: Karl J. Astrom and Lars Rundqwist, ["Integrator Windup and How to Avoid It"](https://cse.lab.imtlucca.it/~bemporad/teaching/controllodigitale/pdf/Astrom-ACC89.pdf), Proceedings of the 1989 American Control Conference, 1989. The paper discusses practical anti-windup schemes and a unifying tracking view.

[^mathworks]: MathWorks, ["Anti-Windup Control Using PID Controller Block"](https://www.mathworks.com/help/simulink/slref/anti-windup-control-using-a-pid-controller.html). The documentation describes back-calculation, clamping, and tracking-mode anti-windup behavior for saturated actuators.
