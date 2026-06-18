---
layout: post
title: "The Counterexample Needs a Loop"
description: "Safety bugs can stop at a bad prefix. Liveness bugs need an infinite witness, so finite-state model checkers hand you a prefix plus a loop."
date: 2026-06-18 06:42:00 -0400
categories: computer-science
tags: [model-checking, temporal-logic, liveness, safety, automata, distributed-systems]
excerpt: "A liveness failure is not just a long trace. In a finite graph, it is a lasso: reach a cycle where the promised good event never happens."
---

Some bugs can be photographed.

Two traffic lights are green at once. A balance goes negative. A read returns a
value that no write could have produced. Once the bad state appears, the trace
can stop. The prefix is already enough evidence.

Other bugs need a film reel.

A request is accepted and never answered. A leader election keeps restarting. A
garbage collector keeps postponing one object. No finite prefix proves the
promise is broken, because the next step could still be the one where the good
thing finally happens.

That is the operational split between safety and liveness.

Alpern and Schneider's classic formulation is still the cleanest slogan:
safety says that nothing bad happens; liveness says that something good
eventually happens.[^alpern-schneider] Pnueli's temporal logic of programs gave
program verification a language for those "always" and "eventually" claims.[^pnueli]

The slogans are useful, but the debugger needs shapes:

```text
safety counterexample  = finite bad prefix
liveness counterexample = finite prefix + repeatable bad loop
```

The second line is the quiet trick behind many model checkers. If a finite-state
system has an infinite run that violates an eventuality, then after some prefix
it must revisit a state. The witness can be printed as a lasso: reach the loop,
then go around it forever.

## A Tiny Model Checker

The lab below runs two deliberately small transition systems.

The left graph checks a safety property:

$$
G(\text{not both lights green}).
$$

If the bad switch transition exists, breadth-first search finds a shortest bad
prefix.

The right graph checks a liveness property:

$$
G(\text{request} \Rightarrow F\ \text{grant}).
$$

The checker builds a product of the system with a one-bit obligation monitor:
after a request, the monitor says "owed" until a grant clears the debt. Then it
searches the grant-free part of that product graph for a reachable cycle while
the debt is still owed.

<style>
  .temporal-lab {
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

  .temporal-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .temporal-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .temporal-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
    width: 100%;
  }

  .temporal-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .temporal-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .temporal-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .temporal-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .temporal-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .temporal-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .temporal-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .temporal-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .temporal-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 520px) {
    .temporal-lab {
      padding: 0.75rem;
    }

    .temporal-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="temporal-lasso-lab" class="temporal-lab" data-temporal-lasso-lab>
  <div class="temporal-lab__controls">
    <label>
      Safety bug:
      <select data-param="conflict">
        <option value="on" selected>bad switch exists</option>
        <option value="off">no bad switch</option>
      </select>
    </label>
    <label>
      Scheduler skip:
      <select data-param="skip">
        <option value="on" selected>pending can skip</option>
        <option value="off">pending must grant</option>
      </select>
    </label>
    <label>
      Grant fairness:
      <select data-param="fairness">
        <option value="none" selected>none</option>
        <option value="weak">weak fairness</option>
      </select>
    </label>
    <label>
      Outage loop:
      <select data-param="outage">
        <option value="off" selected>no outage</option>
        <option value="on">grant can disappear</option>
      </select>
    </label>
  </div>
  <div class="temporal-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="700" aria-label="Temporal logic model-checking lab showing a finite safety bad prefix and a liveness lasso witness"></canvas>
  <div class="temporal-lab__legend">
    <span><i style="background:#be123c"></i> Safety violation</span>
    <span><i style="background:#2563eb"></i> Request/grant state</span>
    <span><i style="background:#f59e0b"></i> Witness loop</span>
    <span><i style="background:#7c3aed"></i> Fairness assumption</span>
    <span><i style="background:#b45309"></i> Grant disabled</span>
  </div>
  <p class="temporal-lab__note">
    Deterministic finite-state experiment. The safety side uses BFS over states.
    The liveness side builds a product graph with a one-bit request obligation,
    removes grant transitions, and searches for a reachable cycle with the
    obligation still owed. Weak fairness rules out the pure skip loop only when
    grant is continuously enabled around the loop.
  </p>
</div>
<script defer src="{{ '/assets/js/temporal-lasso-lab.js?v=20260618a' | relative_url }}"></script>

With the default controls, the left side finds the finite trace:

```text
idle -> NS green -> both green
```

That is a safety counterexample. It does not need to say what happens afterward.
The property has already been falsified.

The right side finds a different kind of object:

```text
idle -> pending -> pending -> pending -> ...
```

The request has happened. The grant has not. The loop says it never has to.
That is a liveness counterexample.

Now switch **Grant fairness** to `weak fairness`. The pure skip loop disappears.
This is not because the graph changed. It is because the admissible executions
changed. If `grant` remains enabled forever, weak fairness says the scheduler
cannot ignore it forever.

Then turn on **Outage loop**. The lasso returns:

```text
idle -> pending -> outage -> outage -> ...
```

Weak grant fairness does not help, because the grant action is no longer
continuously enabled in the loop. This is the production lesson hiding inside a
toy graph: a fairness assumption can separate an unfair scheduler from a real
loss of capability. That distinction is often exactly where an incident lives.

## Why a Finite Log Cannot Kill Liveness

Suppose a log ends like this:

```text
request at t=14
no grant by t=20
```

That is evidence of delay. It is not, by itself, proof of a liveness violation.
The grant might occur at `t=21`.

Safety is different. If the log contains:

```text
both traffic lights green at t=14
```

no extension can repair the prefix. The bad thing happened.

This is why liveness debugging often feels slippery. A long wait can be a
symptom, a performance bug, a missing fairness assumption, or a genuine
eventuality failure. The model checker's lasso sharpens the claim:

1. here is how to reach the owed obligation;
2. here is a cycle that can repeat forever;
3. the cycle never performs the event that clears the obligation;
4. the cycle is allowed under the stated fairness assumptions.

The automata-theoretic model-checking program made this shape systematic:
translate the temporal property to an automaton, compose it with the system, and
look for an accepting cycle in the product.[^vardi-wolper] SPIN made that style
of executable temporal debugging a practical tool for protocol and concurrent
software models.[^spin]

The lab is much smaller than those tools, but the skeleton is the same. The
request monitor is a tiny property automaton. The liveness failure is not stored
in any one state of the original graph. It appears in the product: system state
plus the unresolved temporal debt.

## The Fairness Footnote Is Not a Footnote

Many distributed-systems specifications say some version of:

```text
if a message is continuously retransmitted, it is eventually delivered
if a process remains enabled, it eventually takes a step
if a timer keeps expiring, some election eventually completes
```

These are not safety claims. They are assumptions about the infinite tail of an
execution.

They are also not free. If the network can partition forever, if the process can
pause forever, if the scheduler can starve a task forever, then the liveness
proof may be proving a conditional theorem about a nicer world.

That is fine when the condition is explicit. It is dangerous when the condition
is hidden in prose.

The practical review questions are:

- What is the safety invariant, and what finite prefix would refute it?
- What is the liveness promise, and what loop would refute it?
- Which actions are assumed fair?
- Is fairness weak, strong, probabilistic, deadline-bounded, or just hoped for?
- Can the "enabled" action become disabled by crash, partition, backpressure, or
  admission control?
- Does the implementation log enough state to distinguish unfair delay from lost
  capability?

Timing usually belongs on the liveness side. A timeout may help a protocol make
progress, but the proof should say whether the timeout is an assumption, a
detector, or just one transition in the graph.

## The Audit

The lab exports the checker it uses:

```bash
node - <<'NODE'
const lab = require("./assets/js/temporal-lasso-lab.js");
const audit = lab.audit();
if (!audit.pass) throw new Error(JSON.stringify(audit.failures));
console.log("temporal lasso audit passed");
NODE
```

The audit checks the cases the prose depends on:

- disabling the bad switch removes the safety prefix;
- enabling it produces a prefix ending at `both green`;
- an unfair skip loop violates request-response liveness;
- weak grant fairness removes that pure skip loop;
- an outage loop remains a liveness violation even under weak grant fairness;
- every lasso cycle avoids `grant`.

That is intentionally tiny. The point is not to replace TLA+, SPIN, nuXmv, or a
real protocol model. The point is to make the counterexample shape visible
enough that prose cannot blur it.

A safety bug is a stopped photograph.

A liveness bug is a film strip that found a loop.

## Further Reading

[^pnueli]: Amir Pnueli, ["The Temporal Logic of Programs"](https://doi.org/10.1109/SFCS.1977.32), *18th Annual Symposium on Foundations of Computer Science*, 1977. DBLP record: <https://dblp.org/rec/conf/focs/Pnueli77>.

[^alpern-schneider]: Bowen Alpern and Fred B. Schneider, ["Defining Liveness"](https://doi.org/10.1016/0020-0190(85)90056-0), *Information Processing Letters*, 1985.

[^vardi-wolper]: Moshe Y. Vardi and Pierre Wolper, ["An Automata-Theoretic Approach to Automatic Program Verification"](https://lics.siglog.org/1986/VardiWolper-AnAutomataTheoretic.html), *LICS*, 1986. A later journal version is ["Reasoning about infinite computations"](https://doi.org/10.1016/0890-5401(94)90051-5), *Information and Computation*, 1994.

[^spin]: Gerard J. Holzmann, ["The model checker SPIN"](https://doi.org/10.1109/32.588521), *IEEE Transactions on Software Engineering*, 1997. The SPIN project page is <https://spinroot.com/spin/whatispin.html>.
