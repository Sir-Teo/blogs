---
layout: post
title: "The Failing Test Case Shrinks by Asking Halves"
description: "Delta debugging turns a huge failing input into a small witness, but its promise is 1-minimality under a test oracle, not omniscience."
date: 2026-06-15 16:03:00 -0400
categories: software-engineering
tags: [delta-debugging, debugging, test-reduction, software-engineering, compilers, fuzzing]
excerpt: "A reducer is a negotiation with a failure oracle: remove a chunk, ask whether the bug remains, and remember that a local witness is not necessarily the globally smallest explanation."
---

The best bug reports often look suspiciously small.

```text
input: 12 lines
expected: no crash
actual: crash
```

That smallness is not cosmetic. A tiny failing input is a compressed argument.
It says: the failure is not hiding in the rest of the program, the rest of the
file, the rest of the workload, or the rest of the weekend.

The hard part is that failures rarely arrive tiny. They arrive as generated C
programs, browser sessions, serialized requests, traces, notebooks, ASTs,
emails, configuration bundles, and fuzz inputs. The first artifact proves the
bug exists. The reduced artifact makes the bug negotiable.

Delta debugging is the little machine that performs that negotiation.

## The Reducer Has One Question

Zeller and Hildebrandt's 2002 delta debugging paper begins from a simple
premise: given a failing test case, find which circumstances are responsible
for the failure.[^zeller] Their `ddmin` algorithm treats the input as a set or
sequence of removable changes and repeatedly asks one question:

```text
if I keep or remove this chunk,
does the interesting failure still happen?
```

The answer comes from a test function. In practice that function might compile
a file, replay a browser session, run a differential test, check a sanitizer
trace, or compare an assertion. For the algorithm, the oracle only needs to
return three kinds of information:

```text
FAIL        the same interesting failure still happens
PASS        the failure is gone
UNRESOLVED  the candidate cannot be judged
```

`UNRESOLVED` matters. If deleting half a C program leaves a syntactically
invalid fragment, the compiler crash did not disappear in a meaningful way. You
asked a malformed question.

The classic loop is almost rude in its simplicity:

1. Split the current failing input into `n` chunks.
2. If a chunk alone still fails, keep that chunk.
3. Otherwise, if removing a chunk still fails, drop that chunk.
4. Otherwise, increase `n` and ask finer questions.
5. Stop when every single remaining atom is individually necessary.

The last sentence is the contract. `ddmin` aims for a 1-minimal failing input:
remove any one remaining atom and the failure no longer reproduces. That is not
the same as "smallest possible input." It is a local certificate under the
questions the reducer happened to ask.

## A Small Reducer Lab

The lab below runs an exact implementation of `ddmin` and, for structured
inputs, a small tree-aware reducer in the style of hierarchical delta
debugging.[^hdd] It is deterministic: every number shown comes from the
JavaScript shipped with this post.

Try the **Two independent bugs** case first. In the natural order, flat
`ddmin` returns a five-atom witness. Exhaustive search over the same 16 atoms
finds a two-atom witness. That is not a bug in the algorithm; it is the
difference between 1-minimal and globally minimum. Now switch **Atom order** to
**Short witness first**. The reducer finds the two-atom witness because its
first successful questions lead into a different basin.

Then switch to **Structured input**. Flat deletion spends most of its time
asking invalid questions. The tree-aware reducer removes whole syntactic
regions first, then trims inside the surviving regions while preserving the
syntax shell.

<style>
  .delta-lab {
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

  .delta-lab__controls {
    display: grid;
    gap: 0.75rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    margin-bottom: 0.9rem;
  }

  .delta-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    font-weight: 700;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .delta-lab__controls select {
    appearance: none;
    background: #f8fafc;
    border: 1px solid #cbd5df;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    line-height: 1.25;
    min-width: 0;
    padding: 0.48rem 0.62rem;
    width: 100%;
  }

  .delta-lab__case {
    border-top: 1px solid #e4eaf0;
    display: grid;
    gap: 0.2rem;
    margin-top: 0.2rem;
    padding-top: 0.85rem;
  }

  .delta-lab__case strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1rem;
    line-height: 1.25;
  }

  .delta-lab__case span,
  .delta-lab__note,
  .delta-lab__legend,
  .delta-lab__moves {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .delta-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
    margin: 0.85rem 0;
  }

  .delta-lab__metric {
    background: #f8fafc;
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    min-width: 0;
    padding: 0.58rem 0.62rem;
  }

  .delta-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .delta-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.16rem;
    overflow-wrap: anywhere;
  }

  .delta-lab__note {
    margin: 0.4rem 0 0.8rem;
  }

  .delta-lab__canvas {
    border: 1px solid #e4eaf0;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 650px;
    margin: 0.8rem 0;
    max-width: 100%;
    width: 100%;
  }

  .delta-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.8rem;
    margin: 0.5rem 0 0;
  }

  .delta-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.3rem;
    min-width: 0;
  }

  .delta-lab__legend i {
    border-radius: 3px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .delta-lab__legend .is-fail {
    background: #0f766e;
  }

  .delta-lab__legend .is-pass {
    background: #94a3b8;
  }

  .delta-lab__legend .is-unresolved {
    background: #d97706;
  }

  .delta-lab__legend .is-kept {
    background: #2563eb;
    box-shadow: inset 0 0 0 2px #172026;
  }

  .delta-lab__moves {
    border-top: 1px solid #e4eaf0;
    margin: 0.85rem 0 0;
    padding: 0.85rem 0 0 1.25rem;
  }

  .delta-lab__moves li + li {
    margin-top: 0.22rem;
  }

  .delta-lab__moves span {
    color: #172026;
    font-weight: 750;
  }

  @media (max-width: 520px) {
    .delta-lab {
      padding: 0.75rem;
    }

    .delta-lab__canvas {
      height: 650px;
    }
  }
</style>

<div class="delta-lab" data-delta-lab data-scenario="forked" data-order="natural"></div>

<script src="{{ '/assets/js/delta-debugging-lab.js?v=20260615a' | relative_url }}"></script>

## Minimal Is Not Minimum

The **Two independent bugs** case is the trap I want people to remember.

The original input contains two unrelated failure recipes:

```text
five atoms reproduce bug A
two atoms reproduce bug B
```

In natural order, `ddmin` first finds a failing half that contains the five-atom
recipe. From then on it reduces inside that half. The final five atoms are
1-minimal: remove any one and bug A is gone. But the whole original input still
contained a smaller bug B witness that the reducer discarded early.

This is not a condemnation of delta debugging. It is a warning about what its
certificate means.

If you need the absolute smallest witness, exhaustive search is the obvious
definition and the impossible method. Even in the tiny lab, exhaustive search
is only enabled for small cases. Real reducers survive by using a cheaper
contract:

```text
small enough to understand
still reproduces the interesting failure
locally irreducible under the reducer's atoms
```

That contract is often exactly what a maintainer needs.

## The Oracle Is Part of the Algorithm

The reducer is only as good as its test function.

A poor oracle answers the wrong question:

```text
does the program crash?
```

A better oracle asks:

```text
does the same interesting failure still happen?
```

Those are different. A reduced input that triggers a parser error instead of
the optimizer crash is not a successful reduction. A C program whose behavior
depends on undefined behavior is not a clean compiler bug report. A flaky test
that fails one time in ten is not the same object as a deterministic failure.

This is why practical reducers are full of domain checks. Regehr, Chen, Cuoq,
Eide, Ellison, and Yang made this explicit in their PLDI 2012 work on C
compiler test-case reduction: validity is part of the problem, not a cleanup
step after minimization.[^creduce] Their C-Reduce line of work did not merely
delete text; it used transformations and checks designed to keep the reduced C
program suitable for a real compiler bug report.

The lab's **Structured input** case is a cartoon of the same issue. Flat
deletion can remove an opening syntax token while keeping the body. The test
function returns `UNRESOLVED`, because that candidate is not a meaningful
question about the original bug. The tree-aware reducer avoids those questions
by deleting subtrees first.

The machine is not just:

```text
search over subsets
```

It is:

```text
search over meaningful variants
```

## Why Halves Work So Well

The magic is not that halving always guesses the culprit. It usually does not.
The magic is that a failed coarse question still tells you how to spend the
next question.

Suppose removing a half keeps the failure. You just deleted a large irrelevant
region. Suppose no half works. Then maybe the failure is scattered, so you
raise the granularity and try smaller pieces. The algorithm alternates between
optimism and humility:

```text
maybe the bug is concentrated
maybe the bug is distributed
ask cheaply, then adapt
```

Zeller and Hildebrandt's paper includes case studies where large browser and
fuzzing inputs shrink dramatically, including a Mozilla HTML crash reduced to a
single relevant line in their experiment.[^zeller] That empirical punchline is
easy to misread as "divide and conquer finds the cause." The subtler lesson is
that the reducer turns an expensive human search into a sequence of executable
questions.

The ordering of those questions still matters. In the lab's optimizer case,
the same four-token witness is found under all displayed orders, but the number
of tests changes. In the independent-bug case, the output itself changes. A
real reducer can exploit this by trying likely chunks first, preserving syntax,
using passes that understand the language, and caching every test result.

## What I Would Want in a Real Reducer

For a production reducer, I would want five boring things before I wanted one
clever thing.

First, the oracle should fingerprint the failure. Exit code is usually too
weak. Stack signature, assertion text, sanitizer category, differential output,
and minimized nondeterminism are all part of the contract.

Second, the reducer should cache aggressively. Re-running the same candidate is
common once complements and finer granularities interact.

Third, the atomization should match the artifact. Lines are fine for logs.
Tokens are better for source. AST nodes are better still when syntax validity
matters. For structured inputs, Misherghi and Su's HDD result is the right
instinct: use the tree you already have.[^hdd]

Fourth, the reducer should report its own uncertainty. "1-minimal under these
atoms" is more honest than "minimal."

Fifth, every reduced witness should be treated as a bug-report artifact, not as
the explanation itself. A tiny input can focus attention. It cannot prove which
line in the implementation is wrong.

The final witness is a good suspect. The trial still has to happen.

## The Small Print I Trust

The lab exports the same functions used by the page. Its audit checks:

- the original cases fail;
- flat `ddmin` returns failing 1-minimal outputs;
- the monotone optimizer case shrinks from 20 atoms to 4 triggers;
- the independent-bug case has a 5-atom 1-minimal result while exhaustive
  search finds a 2-atom global witness;
- changing the order can expose that shorter witness;
- the structured case produces unresolved flat tests;
- the tree-aware reducer produces zero unresolved candidates on that case.

On the default independent-bug case, the relevant facts are:

```json
{
  "atoms": 16,
  "flatSize": 5,
  "flatTests": 30,
  "flatOneMinimal": true,
  "globalSize": 2
}
```

That is the whole lesson in miniature. A reducer is not an oracle of truth. It
is a disciplined way to ask the failure what it can live without.

[^zeller]: Andreas Zeller and Ralf Hildebrandt, ["Simplifying and Isolating Failure-Inducing Input"](https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/delta-debugging.pdf), *IEEE Transactions on Software Engineering*, 2002.

[^hdd]: Ghassan Misherghi and Zhendong Su, ["HDD: Hierarchical Delta Debugging"](https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/hdd.pdf), *International Conference on Software Engineering*, 2006.

[^creduce]: John Regehr, Yang Chen, Pascal Cuoq, Eric Eide, Chucky Ellison, and Xuejun Yang, ["Test-Case Reduction for C Compiler Bugs"](https://users.cs.utah.edu/~regehr/papers/pldi12-preprint.pdf), *Programming Language Design and Implementation*, 2012.
