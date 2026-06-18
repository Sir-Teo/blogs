---
layout: post
title: "The Old Code Still Had a Switch"
description: "Knight Capital's 2012 loss was not just a bad deploy. It was stale production code, a reused flag, missing router-level controls, and a live market loop."
date: 2026-06-17 11:00:00 -0400
categories: software-engineering
tags: [knight-capital, deployment, incident-analysis, market-access, automated-trading, risk-controls, software-engineering]
excerpt: "A dormant code path is not dead if production can still route control flow into it. Knight Capital's 2012 incident is a case study in stale code, missing kill switches, and risk controls that observed too late."
---

The dangerous code path was not new.

That is the part I keep coming back to.

On August 1, 2012, Knight Capital Americas experienced a failure in an automated
equity order router called SMARS. According to the SEC's later settled order,
SMARS processed 212 small retail parent orders, routed millions of child orders
over about 45 minutes, obtained more than 4 million executions in 154 stocks,
and traded more than 397 million shares. Knight ended with unwanted positions of
about $3.5 billion net long and $3.15 billion net short, and ultimately lost
over $460 million.[^sec-order]

Knight's own August 2, 2012 press release put the realized pre-tax loss at
approximately $440 million and said the problem was related to installation of
trading software.[^knight-update] The SEC order came later, with more detail.
The order was settled without Knight admitting or denying the findings, except
for jurisdiction and related procedural matters.[^sec-order]

So the evidence standard here is:

```text
facts below are SEC findings unless I mark them as interpretation
```

The interpretation is mine:

```text
old production code is still production code if anything can call it
```

## The Flag Was Reused

Knight was preparing SMARS for the NYSE Retail Liquidity Program, scheduled to
start on August 1, 2012. The new RLP-related code was meant to replace unused
code for an older SMARS feature called Power Peg.[^sec-order]

Power Peg was not supposed to be active. But according to the SEC, the old code
was still present and callable. The new RLP work also reused a flag that had
formerly activated Power Peg. Knight intended that flag to activate the new RLP
logic after the old code was removed.

That is already a sharp interface:

```text
same flag value
different production meaning
depends on every server receiving the same code state
```

The older code had another problem. In 2005, Knight had moved a cumulative
quantity function to an earlier point in the SMARS code sequence. That function
had originally helped Power Peg stop sending child orders after the parent
order was filled. The SEC found that Knight did not retest Power Peg after
moving the function.[^sec-order]

So Power Peg was both unused and unproven.

That combination is worse than obviously broken code. Obviously broken code
attracts attention. Dormant code can keep the badge of production legitimacy
while quietly losing the test coverage, operational familiarity, and invariants
that once made it safe.

## One Server Missed the Deploy

Beginning July 27, 2012, Knight deployed the new code to SMARS servers in
stages. One technician did not copy the new code to one of eight SMARS
servers. The SEC found there was no second-technician review requirement, no one
realized the eighth server still had Power Peg and lacked the new RLP code, and
Knight had no written procedure requiring that review.[^sec-order]

On August 1, orders carrying the repurposed flag reached the system. Seven
servers processed them correctly. The eighth server interpreted the flag as a
Power Peg activation. Because the cumulative quantity information no longer
flowed as that old code expected, the server repeatedly sent child orders even
after parent orders had already been filled.[^sec-order]

The failure shape was not:

```text
bad code executes once
```

It was:

```text
bad code executes
does not observe completion
keeps producing marketable output
```

That is a feedback failure. The order router kept asking the market to do work
after another part of the system already knew the customer-sized job was done.

## The Alerts Were Not Alerts

There was a warning before the open.

The SEC found that beginning around 8:01 a.m. Eastern, Knight's internal system
generated 97 automated emails called BNET rejects. These messages referenced
SMARS and identified a Power Peg disabled error. They were caused by the code
deployment failure and were sent before the 9:30 a.m. market open.[^sec-order]

But they were not designed as system alerts, and Knight personnel generally did
not review them when received. They were not acted on before the open and were
not used to diagnose the problem after the open.[^sec-order]

This is a useful distinction:

```text
message delivered != alert received
alert received   != incident response triggered
```

A production system can emit the truth and still fail operationally if the
truth lands in a channel nobody treats as binding.

## The Control Was After the Damage

The SEC's market access rule, Rule 15c3-5, requires broker-dealers with market
access to establish documented risk controls and supervisory procedures
reasonably designed to manage financial, regulatory, and other risks. Among
other things, the controls must be designed to prevent erroneous orders and
orders that exceed pre-set credit or capital thresholds.[^market-access]

The SEC order says Knight had controls before orders reached SMARS, but did not
have adequate controls inside SMARS to prevent erroneous orders from leaving
the router. One missing control was the simple-sounding comparison of orders
leaving SMARS with orders entering it.[^sec-order] In other words:

```text
router output should be accountable to router input
```

Knight also had a post-execution position monitor called PMON. But PMON relied
on human monitoring, was not linked to order entry in a way that could
automatically stop orders at pre-set capital thresholds, did not display account
limits, and experienced delays during high-volume events.[^sec-order]

Observation after execution is not the same as prevention before submission.

The SEC press release later summarized this as the agency's first enforcement
action under the market access rule and said Knight agreed to pay a $12 million
penalty.[^sec-release] The formal order also censured Knight, imposed a
cease-and-desist order, and required undertakings including an independent
consultant review.[^sec-order]

## Lab: A Stale Server With a Loop

The lab below is not a reconstruction of Knight's real order book. It does not
model NYSE opening auctions, venue routing, price impact, order types,
liquidation strategy, stock-level heterogeneity, Regulation SHO, or the exact
sequence of human response.

It is a calibrated toy model of one narrow mechanism:

- a fleet of eight routers;
- one or more stale servers;
- a reused flag that can activate old code on stale servers;
- parent orders that enter the bad path;
- a loop that emits child executions until something stops it;
- optional controls that act before the full exposure horizon.

The default calibration uses the SEC-scale aggregates:

```text
bad parent orders: 212
exposure window:   45 minutes
executions:        about 4.0 million
shares:            about 397 million
loss scale:        about $460 million
```

The model derives average executions per parent per minute, shares per
execution, gross dollars per share, and loss dollars per share from those
aggregate facts. That makes the sliders interpretable, but it also means the
lab is deliberately coarse.

<style>
  .knight-lab {
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

  .knight-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
    margin-bottom: 1rem;
  }

  .knight-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .knight-lab__check {
    align-content: center;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    display: grid;
    grid-template-columns: auto 1fr;
    min-height: 2.45rem;
    padding: 0.48rem 0.6rem;
  }

  .knight-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    min-height: 1.15rem;
  }

  .knight-lab input[type="range"] {
    accent-color: #be123c;
    box-sizing: border-box;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .knight-lab input[type="checkbox"] {
    accent-color: #0f766e;
    inline-size: 1rem;
    margin: 0 0.45rem 0 0;
  }

  .knight-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0 0 0.9rem;
  }

  .knight-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 3.85rem;
    padding: 0.6rem 0.68rem;
  }

  .knight-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.36);
  }

  .knight-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.36);
  }

  .knight-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 740;
    letter-spacing: 0;
    line-height: 1.18;
    margin-bottom: 0.22rem;
    text-transform: uppercase;
  }

  .knight-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.78rem, 2.2vw, 1rem);
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  .knight-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .knight-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="knight-lab" data-knight-lab>
  <div class="knight-lab__controls">
    <label>
      Stale servers
      <output data-value="staleServers">1</output>
      <input type="range" min="0" max="3" step="1" value="1" data-param="staleServers">
    </label>
    <label>
      Bad parents per stale server
      <output data-value="badParentOrders">212</output>
      <input type="range" min="0" max="420" step="1" value="212" data-param="badParentOrders">
    </label>
    <label>
      Exposure minutes
      <output data-value="exposureMinutes">45.0</output>
      <input type="range" min="1" max="60" step="0.5" value="45" data-param="exposureMinutes">
    </label>
    <label>
      Child executions per parent per minute
      <output data-value="executionsPerParentMinute">419</output>
      <input type="range" min="50" max="700" step="1" value="419" data-param="executionsPerParentMinute">
    </label>
    <label class="knight-lab__check">
      <input type="checkbox" data-param="deploymentCheck">
      Deployment verification
    </label>
    <label class="knight-lab__check">
      <input type="checkbox" data-param="routerGuard">
      Router output cap
    </label>
    <label>
      Cap per parent
      <output data-value="outputCap">40</output>
      <input type="range" min="5" max="500" step="5" value="40" data-param="outputCap">
    </label>
    <label class="knight-lab__check">
      <input type="checkbox" data-param="capitalGuard">
      Capital guard
    </label>
    <label>
      Loss limit
      <output data-value="capitalLimit">$50M</output>
      <input type="range" min="5" max="500" step="5" value="50" data-param="capitalLimit">
    </label>
  </div>
  <div class="knight-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Interactive Knight Capital deployment incident model"></canvas>
  <p class="knight-lab__note" data-note></p>
</div>

<script src="{{ '/assets/js/knight-deploy-lab.js?v=20260617a' | relative_url }}"></script>

## What the Controls Change

With the defaults, the toy produces:

```text
child executions: 3,997,260
shares:           396.7 million
gross scale:      $6.65 billion
loss scale:       $459.7 million
amplification:    18,855 child executions per bad parent order
```

Turn on deployment verification and the stale server never becomes an active
market path in the toy. Turn on the router output cap with a cap of 25 child
executions per parent and the toy stops at 5,300 child executions. Turn on a
$20 million capital guard and the toy stops after about 1.96 active minutes.

Those exact counterfactual numbers are not historical claims. They are model
outputs. The historical claim is narrower and better supported: the SEC found
that Knight lacked adequate controls at the router output point, lacked
automated capital-threshold controls that could prevent order entry, and lacked
adequate deployment and incident-response procedures.[^sec-release]

The systems lesson is that each control answers a different failure mode:

```text
deployment parity check -> do all production nodes mean the same thing?
router output cap       -> is output proportional to input?
capital guard           -> can exposure stop without a meeting?
incident procedure      -> who is allowed to halt while diagnosis is incomplete?
```

The last line matters. The SEC found that while Knight staff tried to diagnose
the problem in the live trading environment, Knight remained connected and kept
sending orders. In one attempted fix, Knight removed the new RLP code from the
seven servers where it had been deployed correctly, which worsened the problem
by allowing more incoming parent orders to activate Power Peg on those
servers.[^sec-order]

That is what an incident runbook is for. It is not a poem about calmness. It is
a pre-authorized answer to the question:

```text
when we do not yet understand the bug,
which outputs are no longer allowed?
```

## Reproducibility Check

The lab exports the same calculation for Node:

```js
const lab = require("./assets/js/knight-deploy-lab.js");

const rows = lab.auditGrid();
const failed = rows.filter((row) => !row.passed);
if (failed.length) throw new Error(JSON.stringify(failed));

console.table(rows.map((row) => ({
  stale: row.params.staleServers,
  check: row.params.deploymentCheck,
  router: row.params.routerGuard,
  capital: row.params.capitalGuard,
  executions: Math.round(row.executions),
  sharesM: (row.shares / 1e6).toFixed(1),
  lossM: (row.estimatedLoss / 1e6).toFixed(1),
  minutes: row.activeMinutes.toFixed(2),
  passed: row.passed
})));
```

The audit checks that the default calibration is close to the SEC aggregate
execution, share, and loss scale; that a deployment check prevents stale-server
activation; that a zero-stale-server case creates no erroneous executions; and
that router and capital guards enforce their configured bounds.

## The Smaller Lesson

It is tempting to file Knight under "bad deploy" and move on. That is too
small.

A missed server mattered because old code was still callable. A reused flag
mattered because different servers disagreed about its meaning. The alert
emails mattered less than the absence of an operational channel that made them
interruptive. The position monitor mattered less than the fact that it could
not prevent order entry. Diagnosis mattered less than the decision to remain
connected while diagnosis was still uncertain.

The useful abstraction is:

```text
a production system is the code paths that can still affect the outside world
```

Not the code paths you meant to use.

Not the code paths you remember.

Not the code paths that passed their last test in 2003.

If the switch still reaches them, they are alive.

[^sec-order]: U.S. Securities and Exchange Commission, ["In the Matter of Knight Capital Americas LLC," Exchange Act Release No. 70694](https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf), October 16, 2013. The order describes SMARS, the Power Peg/RLP deployment, the 212 parent orders, more than 4 million executions, more than 397 million shares, the long and short positions, and the risk-control findings.

[^knight-update]: Knight Capital Group, Inc., ["Knight Capital Group Provides Update Regarding August 1st Disruption to Routing in NYSE-Listed Securities"](https://www.sec.gov/Archives/edgar/data/1060749/000119312512332176/d391111dex991.htm), furnished as Exhibit 99.1 on August 2, 2012. Knight reported an approximately $440 million realized pre-tax loss and said the software issue had been removed from its systems.

[^market-access]: U.S. Securities and Exchange Commission, ["Risk Management Controls for Brokers or Dealers with Market Access," Exchange Act Release No. 63241](https://www.sec.gov/files/rules/final/2010/34-63241.pdf), November 3, 2010. The adopting release explains Rule 15c3-5's requirement for broker-dealer market-access risk controls, including controls designed to limit financial exposure and prevent erroneous orders.

[^sec-release]: U.S. Securities and Exchange Commission, ["SEC Charges Knight Capital With Violations of Market Access Rule"](https://www.sec.gov/newsroom/press-releases/2013-222), October 16, 2013. The press release summarizes the SEC's findings, calls the case the first enforcement action under the market access rule, and states the $12 million settlement penalty.
