---
layout: post
title: "The Regex Is a Program"
description: "A regular expression is not just a pattern. Depending on the engine, it can be a linear automaton or an exponential search program."
date: 2026-06-13 23:52:00 -0400
categories: software-engineering
tags: [regular-expressions, automata, redos, performance, security, software-engineering]
excerpt: "Catastrophic backtracking is not a mysterious regex curse. It is a search tree hiding behind a pattern that looks innocent."
---

A regular expression looks declarative.

```text
match this shape of text
```

But a regex engine is executable machinery. Two engines can accept the same
language and have radically different failure behavior. One walks a finite
automaton. Another performs a depth-first search through choices. Most of the
time both feel instant. Then someone sends a string that nearly matches.

The difference becomes production.

The small villain in this post is:

```text
^(a+)+b$
```

It recognizes the same simple language as:

```text
^a+b$
```

One or more `a` characters, followed by a `b`.

The two patterns are extensionally equivalent for this toy alphabet. They do
not have the same operational meaning in a backtracking engine. The first
pattern asks the engine to decide how the run of `a`s should be split across
the inner `a+` and the outer `+`. If the final `b` is missing, every split is
wrong, and the engine may have to prove that by trying them.

That is the whole bug: a regular expression can hide a combinatorial search.

## The old good idea

Ken Thompson's 1968 regular-expression algorithm compiled a regular expression
into an automaton-like program and simulated possible states together.[^thompson]
The implementation details are beautifully old-school, but the engineering
lesson is modern: do not confuse nondeterminism with backtracking. You can carry
many possible states at once instead of recursively guessing one path and
returning later.

Russ Cox's classic article made this contrast concrete for working programmers:
some widely used backtracking engines take exponential time on pathological
patterns, while a Thompson NFA simulation stays fast for regular expressions
without non-regular features.[^cox]

The phrase "without non-regular features" matters. Modern regex dialects are
not just regular expressions in the formal-language sense. Backreferences,
lookarounds, captures, lazy quantifiers, atomic groups, Unicode rules, and
leftmost-first submatch semantics all complicate the story. Some features can be
handled with automata. Some are not regular. Some engines use hybrid strategies.

Still, the core distinction is sturdy:

```text
backtracking asks "which path should I try first?"
automata simulation asks "which states are possible now?"
```

The second question is much harder to trick into exponential wandering.

## A failure string is a proof obligation

Catastrophic backtracking is usually loudest when the input almost matches.

For `^(a+)+b$`, the string:

```text
aaaaaaaaaaaaaaaaaa
```

has no final `b`. A human sees the failure immediately. A naive backtracking
engine cannot skip the proof. Maybe the first `a+` consumed too many `a`s.
Maybe the outer repetition should have split them differently:

```text
aaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaa | a
aaaaaaaaaaaaaaaa | aa
aaaaaaaaaaaaaaaa | a | a
...
```

There are $$2^{n-1}$$ ways to place cuts between $$n$$ adjacent `a` characters.
Every one still lacks a final `b`.

That is why regular expression denial of service, ReDoS, belongs to the broader
family of algorithmic complexity attacks: the attacker supplies a small input
that drives a common-case-fast algorithm into its worst case.[^crosby] Recent
surveys of ReDoS research emphasize the same engineering gap: regex engines,
their defenses, and their language features vary enough that analysis must be
grounded in real implementations, not only textbook models.[^sok]

## A backtracking lab

The lab below models full-string matching of `^(a+)+b$`. It compares three
execution stories:

- **Backtracking:** depth-first exploration of possible splits of the `a` run.
- **Thompson NFA:** state-set simulation of the same nested pattern.
- **Rewrite:** the equivalent pattern `^a+b$`.

The counts are not timings from your browser's regex engine. That is deliberate.
Different JavaScript versions have different regexp mitigations, fallbacks, and
JIT behavior. The lab counts the abstract work of the algorithms so the
structure is visible.

<style>
  .regex-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .regex-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  }

  .regex-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .regex-lab__controls input,
  .regex-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    width: 100%;
  }

  .regex-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .regex-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .regex-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .regex-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .regex-lab__metric--warn {
    border-color: rgba(180, 83, 9, 0.42);
  }

  .regex-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .regex-lab__metric span,
  .regex-lab__note,
  .regex-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .regex-lab__metric span {
    display: block;
  }

  .regex-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.18rem;
    line-height: 1.25;
    margin-top: 0.22rem;
  }

  .regex-lab canvas {
    display: block;
    max-width: 100%;
  }

  .regex-lab__legend {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.7rem;
  }

  .regex-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .regex-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .regex-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div id="regex-backtracking-lab" class="regex-lab" data-regex-lab>
  <div class="regex-lab__controls">
    <label>
      Number of a's: <output data-value="aCount">18</output>
      <input type="range" min="4" max="30" step="1" value="18" data-param="aCount">
    </label>
    <label>
      Input suffix: <output data-value="suffix">a...a</output>
      <select data-param="suffix">
        <option value="missing" selected>Missing final b</option>
        <option value="present">Has final b</option>
      </select>
    </label>
    <label>
      Plot through n: <output data-value="maxPlot">24</output>
      <input type="range" min="8" max="30" step="1" value="24" data-param="maxPlot">
    </label>
    <label>
      Highlight: <output data-value="highlight">backtracking</output>
      <select data-param="highlight">
        <option value="backtrack" selected>Backtracking</option>
        <option value="thompson">Thompson NFA</option>
        <option value="rewrite">Rewrite</option>
      </select>
    </label>
  </div>
  <div class="regex-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="610" aria-label="Regular expression engine simulator comparing catastrophic backtracking, Thompson NFA simulation, and a safe rewrite"></canvas>
  <div class="regex-lab__legend">
    <span><i style="background:#be123c"></i> backtracking</span>
    <span><i style="background:#0f766e"></i> Thompson NFA</span>
    <span><i style="background:#2563eb"></i> rewrite</span>
    <span><i style="background:#7c3aed"></i> active NFA state</span>
  </div>
  <p class="regex-lab__note">
    Deterministic algorithm model. It counts abstract engine work, not browser
    wall-clock time. The NFA panel shows active states after each consumed
    character; state 4 is the pending final b.
  </p>
</div>
<script defer src="{{ '/assets/js/regex-backtracking-lab.js' | relative_url }}"></script>

Try two toggles.

First, switch `Input suffix` to `Has final b`. The backtracking engine succeeds
quickly because its greedy first guess works: one big `a+`, then `b`.

Now switch back to `Missing final b` and increase `Number of a's`. The language
has not become complicated. The proof of failure has. The backtracking line
climbs on the log plot because the engine explores possible cuts. The NFA line
stays almost flat because it keeps possible states alive together.

The rewrite `^a+b$` also stays linear. The cheapest fix is often not a smarter
engine; it is removing the ambiguous nested quantifier.

## Why engines still backtrack

If Thompson-style simulation is so good, why do backtracking engines exist?

Because regex dialects grew features and semantics that are convenient for
programmers but awkward for pure automata. Capturing groups need specific
submatch choices. Lookarounds observe context. Backreferences can make the
language non-regular. Leftmost-first behavior is part of what many programmers
expect. Backtracking is a natural implementation strategy for those features,
and it is fast on ordinary patterns.

Modern systems therefore mix tactics. Google's RE2 is explicitly positioned as
a safe alternative to backtracking engines, trading away some features for
predictable behavior.[^re2] V8 added an experimental non-backtracking regexp
engine and fallback machinery to prevent many catastrophic cases, while noting
that its usual Irregexp engine remains extremely fast for most patterns.[^v8]
Recent work on linear matching for JavaScript regular expressions pushes the
boundary further, showing that some features traditionally excluded from
linear-time engines can be supported with more careful algorithms.[^linear-js]

So the engineering answer is not "all backtracking is bad." It is:

```text
know when your pattern is a search program,
know what engine will execute it,
and never run untrusted text through an uncapped exponential search.
```

## A review checklist

When I review a regex in production code, I do not only ask whether it matches
the examples. I ask:

- Does it have nested quantifiers over overlapping languages?
- Does it have ambiguous alternation such as `(a|aa)+` before a required suffix?
- Does it run on untrusted input or in a shared event loop?
- Is the engine backtracking, automata-based, hybrid, or timeout-capped?
- Are input lengths bounded before the regex runs?
- Can the pattern be rewritten with mutually exclusive branches?
- Can a parser, split, or hand-written scanner make the intended grammar
  clearer?
- Does the test suite include near-miss failures, not only successful matches?

The near-miss is the important case. A regex that matches quickly may still fail
slowly.

## Research direction

I would like regex tooling to report an operational type, not only a syntax
highlight.

Imagine a linter that says:

```text
language: regular
engine requirement: no backreferences
worst-case model: exponential on backtracking VM, linear on Thompson NFA
attack string shape: "a"^n
safe rewrite candidate: ^a+b$
```

The hard part is not catching the classroom examples. It is integrating engine
semantics, production input bounds, and dependency scanning well enough that a
warning means something. That is where the recent ReDoS literature is moving:
away from a single abstract model and toward an engineering account of real
regex engines and their defenses.

A regex is a tiny program. It deserves a profiler.

## Notes

[^thompson]: Ken Thompson, "Programming Techniques: Regular expression search algorithm," *Communications of the ACM*, 1968. [ACM](https://dl.acm.org/doi/10.1145/363347.363387), [CACM](https://cacm.acm.org/research/programming-techniques-regular-expression-search-algorithm/).

[^cox]: Russ Cox, "Regular Expression Matching Can Be Simple And Fast," 2007. [Article](https://swtch.com/~rsc/regexp/regexp1.html).

[^crosby]: Scott A. Crosby and Dan S. Wallach, "Denial of Service via Algorithmic Complexity Attacks," USENIX Security, 2003. [USENIX](https://www.usenix.org/conference/12th-usenix-security-symposium/denial-service-algorithmic-complexity-attacks).

[^sok]: Masudul Hasan Masud Bhuiyan, Berk Cakar, Ethan H. Burmane, and James C. Davis, "SoK: A Literature and Engineering Review of Regular Expression Denial of Service (ReDoS)," arXiv, 2024. [arXiv](https://arxiv.org/html/2406.11618v3).

[^re2]: Google, "RE2: a principled approach to regular expression matching," Google Open Source Blog, 2010, and the RE2 repository. [Blog](https://opensource.googleblog.com/2010/03/re2-principled-approach-to-regular.html), [GitHub](https://github.com/google/re2).

[^v8]: Jakob Gruber, "An additional non-backtracking RegExp engine," V8 Blog, 2021. [V8](https://v8.dev/blog/non-backtracking-regexp).

[^linear-js]: Aurele Barriere and Clement Pit-Claudel, "Linear Matching of JavaScript Regular Expressions," arXiv, 2023. [arXiv](https://arxiv.org/html/2311.17620v2).
