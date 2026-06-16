---
layout: post
title: "The Type Checker Finds the Most General Shape"
description: "Hindley-Milner inference feels like magic because it returns a principal type. Under the hood it is a small equation solver with one crucial habit: generalize only at let."
date: 2026-06-16 19:20:00 -0400
categories: computer-science
tags: [hindley-milner, type-inference, algorithm-w, unification, programming-languages, compilers, type-systems]
excerpt: "Algorithm W is not a mind reader. It builds type equations, unifies them, and hands back the most general receipt for why the expression can run."
---

The nicest type error is the one that tells you the shape of your program.

Not the surface shape:

```text
let id = \x -> x in pair (id 1) (id true)
```

The hidden shape:

```text
(Int, Bool)
```

and the receipt:

```text
id : forall 'a. 'a -> 'a
```

That small `forall` is doing more work than it looks. It says the function was
checked once, then used at two different types without duplicating code and
without lying about either call site. In a Hindley-Milner language, the type
checker is not guessing that receipt. It is solving equations and returning a
**principal type scheme**: the most general type from which the other valid
types can be obtained by substitution.

This post is about that receipt. It is not a tour of every modern type-system
feature. No classes, no traits, no subtyping, no row polymorphism, no effects
system. Just the little machine that made ML-style inference feel unreasonably
good: unification, Algorithm W, let-generalization, and the occurs check.

## The Receipt Is More General Than The Purchase

Take the identity function:

```text
\x -> x
```

It could have type:

```text
Int -> Int
Bool -> Bool
(Int, Bool) -> (Int, Bool)
```

Those are not three unrelated facts. They are instances of one fact:

```text
forall 'a. 'a -> 'a
```

Replace `'a` with `Int` and you get `Int -> Int`. Replace it with `Bool` and
you get `Bool -> Bool`. The principal type is the shape that has not yet spent
its degrees of freedom.

Hindley's 1969 paper proved this kind of principal type-scheme theorem for
combinatory logic.[^hindley] Milner's 1978 paper brought a polymorphic type
discipline and a working inference algorithm into the setting of a programming
language, motivated by ML in the Edinburgh LCF system.[^milner] Damas and
Milner's POPL 1982 paper then gave the classic principal-type result for
functional programs and the algorithmic account now usually taught as Algorithm
W.[^damas-milner]

The historical line matters because it explains the vibe. The type checker is
not a bag of local warnings. It is a theorem-producing machine. Its output says:

```text
here is the weakest type claim strong enough to explain this expression
```

Weakest is good. A more specific type throws away reusable information.

## The Lab

The lab below implements a tiny deterministic Algorithm W for a lambda calculus
with integers, booleans, functions, pairs, `let`, and two primitive functions:

```text
inc : Int -> Int
not : Bool -> Bool
```

The controls are intentionally narrow. Choose a program, toggle
let-polymorphism, and toggle the occurs check. The trace panel shows the
checker manufacturing fresh type variables, looking up schemes, unifying
equations, and binding substitutions. The comparison panel reruns the same
program under nearby rules so the contract becomes visible.

<style>
  .hm-type-lab {
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

  .hm-type-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: minmax(180px, 1.4fr) repeat(2, minmax(120px, 0.7fr));
    margin-bottom: 0.85rem;
  }

  .hm-type-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .hm-type-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.28rem 0.45rem;
    width: 100%;
  }

  .hm-type-lab__toggle {
    align-items: center;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    display: flex;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0.28rem 0.5rem;
  }

  .hm-type-lab__toggle input {
    accent-color: #0f766e;
    margin: 0;
  }

  .hm-type-lab__code {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    color: #172026;
    font-family: var(--font-mono);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0 0 0.8rem;
    overflow-x: auto;
    padding: 0.65rem 0.75rem;
    white-space: pre;
  }

  .hm-type-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .hm-type-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .hm-type-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.7rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .hm-type-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.94rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
  }

  .hm-type-lab__metric.is-good strong {
    color: #0f766e;
  }

  .hm-type-lab__metric.is-warn strong {
    color: #b45309;
  }

  .hm-type-lab__metric.is-bad strong {
    color: #be123c;
  }

  .hm-type-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .hm-type-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .hm-type-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .hm-type-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .hm-type-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .hm-type-lab {
      padding: 0.75rem;
    }

    .hm-type-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="hm-type-lab" class="hm-type-lab" data-hm-type-lab>
  <div class="hm-type-lab__controls">
    <label>
      Program:
      <select data-param="preset">
        <option value="poly-id" selected>let-polymorphic identity</option>
        <option value="compose">compose</option>
        <option value="self-app">self application</option>
        <option value="const">constant function</option>
        <option value="apply-inc">higher-order apply</option>
        <option value="bad-inc">bad primitive call</option>
        <option value="rank-two-shadow">needs rank-2 polymorphism</option>
      </select>
    </label>
    <label>
      Let rule:
      <span class="hm-type-lab__toggle">
        <input type="checkbox" data-param="letPolymorphism" checked>
        generalize lets
      </span>
    </label>
    <label>
      Safety:
      <span class="hm-type-lab__toggle">
        <input type="checkbox" data-param="occursCheck" checked>
        occurs check
      </span>
    </label>
  </div>
  <pre class="hm-type-lab__code" data-code>let id = \x -> x in pair (id 1) (id true)</pre>
  <div class="hm-type-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Hindley-Milner Algorithm W lab showing inference trace, substitution ledger, generalized type schemes, and counterfactual rule switches"></canvas>
  <div class="hm-type-lab__legend">
    <span><i style="background:#7c3aed"></i> Fresh variable</span>
    <span><i style="background:#2563eb"></i> Unification</span>
    <span><i style="background:#0f766e"></i> Binding / success</span>
    <span><i style="background:#b45309"></i> Generalization / warning</span>
    <span><i style="background:#be123c"></i> Type error</span>
  </div>
  <p class="hm-type-lab__note">
    Deterministic toy implementation. The AST is fixed by the selected preset,
    so the experiment is about inference rather than parsing. The exported audit
    checks polymorphic reuse, monomorphic-let failure, occurs-check failure,
    recursive-type behavior when the occurs check is disabled, primitive
    mismatch, and the rank-2-shaped lambda case.
  </p>
</div>
<script defer src="{{ '/assets/js/hm-type-lab.js?v=20260616b' | relative_url }}"></script>

At the default setting, the checker accepts the program:

```text
let id = \x -> x in pair (id 1) (id true)
```

The result is:

```text
(Int, Bool)
```

The important event is not the final pair. It is the let-bound scheme:

```text
id : forall 'a. 'a -> 'a
```

Turn off **generalize lets** and the same program fails. The checker now treats
`id` as having one monomorphic type variable. The first use binds that variable
to `Int`; the second tries to bind it to `Bool`. The complaint is not a quirk.
It is the direct consequence of removing the one place where ordinary
Hindley-Milner creates reusable polymorphism.

## Unification Is The Accountant

Robinson's 1965 resolution paper made unification central to automated
deduction: find a substitution that makes two symbolic expressions the
same.[^robinson] Hindley-Milner inference uses the same kind of machinery on
types.

For a function application:

```text
f x
```

the checker invents a fresh result type:

```text
'r
```

then asks for:

```text
type(f) = type(x) -> 'r
```

If `f` is `inc`, the equation becomes:

```text
Int -> Int = type(x) -> 'r
```

Unification decomposes arrows, producing:

```text
type(x) = Int
'r      = Int
```

Those bindings form a substitution. The substitution is not commentary. It is
the state of the proof. Every later equation is read through it.

That is why the lab's substitution ledger is the heart of the visualization.
Algorithm W is often presented as a recursive function:

```text
W(env, expr) -> (substitution, type)
```

but the operational feel is a ledger:

```text
make a fresh variable
emit an equation
solve the equation
rewrite the world through the solution
continue
```

The elegance comes from how little local syntax the checker needs. A lambda
introduces a fresh type for its parameter. A variable instantiates a scheme from
the environment. A pair infers two sides. A let infers the right-hand side,
generalizes what is not already forced by the environment, and continues.

## Let Is The Polymorphism Gate

Why should `let` get special treatment?

Because the expression:

```text
let id = \x -> x in pair (id 1) (id true)
```

has a sharing boundary. The right-hand side can be checked once:

```text
\x -> x : 'a -> 'a
```

and then the variables not mentioned by the surrounding environment can be
closed into a scheme:

```text
forall 'a. 'a -> 'a
```

Each use of `id` instantiates that scheme with fresh variables:

```text
id 1     : instantiate forall 'a. 'a -> 'a as 't0 -> 't0
id true  : instantiate forall 'a. 'a -> 'a as 't1 -> 't1
```

The two call sites do not fight over a single `'a`.

Lambda-bound variables are different. Try the lab's **needs rank-2
polymorphism** preset:

```text
\f -> pair (f 1) (f true)
```

It fails in vanilla Hindley-Milner. The parameter `f` is introduced with one
monomorphic type variable in that lambda body. The first call wants:

```text
f : Int -> 'a
```

The second call wants:

```text
f : Bool -> 'b
```

Those demands are incompatible. You may know a function such as identity could
serve both roles, but the expression promises that *any* argument `f` can do so.
That requires a type more like:

```text
(forall 'a. 'a -> 'a) -> (Int, Bool)
```

where the argument itself is polymorphic. That is rank-2 polymorphism. It is
not inferred by plain Algorithm W.

This distinction is one of the reasons HM inference feels both powerful and
restrained. It gives you polymorphic `let` without asking for annotations, but
it does not infer arbitrary higher-rank types.

## The Occurs Check Is Where Infinity Knocks

Now choose:

```text
\x -> x x
```

The checker gives `x` a fresh type:

```text
'a
```

The application `x x` asks for the left `x` to be a function from the right
`x` to some result:

```text
'a = 'a -> 'b
```

That equation has no finite simple type. It says a type must contain itself.
The occurs check rejects it.

Turn off **occurs check** in the lab. The machine will record a recursive
binding instead of stopping. That is not a sound version of the tiny HM system;
it is a way to see the forbidden shape. Some languages deliberately include
recursive types, but then the type algebra and proof obligations change. Vanilla
Algorithm W is not secretly doing that.

Milner calls out this limitation in a related form: equations such as a stream
type that unfolds into a function returning more of itself are not solvable by
ordinary unification unless infinite type expressions are admitted.[^milner]
The occurs check is the guardrail that keeps "most general" from becoming
"infinitely self-referential."

## Principal Does Not Mean Omniscient

A principal type is not the same thing as "the best type a human could imagine."
It is the best type within a particular system.

Plain HM has a very clean bargain:

```text
lambda parameters are monomorphic within the body
let-bound expressions may be generalized
applications generate equations
unification solves first-order type variables
```

Stay inside that bargain and the checker can infer principal types without
annotations. Move outside it and something must give.

Higher-rank polymorphism is one example. Effects are another. In a pure
language, generalizing many let-bound expressions is fine. In a strict language
with references, exceptions, or continuations, naive polymorphic generalization
can become unsound. Wright's "Simple Imperative Polymorphism" describes the
standard practical repair: restrict polymorphism to values, sacrificing some
pure-HM-typable expressions to smoothly incorporate imperative features.[^wright]
OCaml exposes the same pressure through weak type variables and the value
restriction.[^ocaml]

That does not make Algorithm W a museum piece. It makes it a reference design.
Modern type checkers keep renegotiating the same contract:

```text
How much can the compiler infer?
How general should inferred types be?
Which effects or abstractions make generalization unsafe?
Where should the programmer annotate intent?
```

The miracle of the classic system is that the base contract is small enough to
implement in a blog post lab and strong enough to explain a family of real
languages.

## A Debugging Habit

When a HM-like checker surprises you, read the program as equations.

For an application, ask:

```text
what type did the function position need to have?
what type did the argument position actually force?
```

For a let binding, ask:

```text
which variables were generalized?
which variables were already fixed by the environment?
is the right-hand side a value in this language?
```

For a strange infinite-looking error, ask:

```text
did some variable need to be both a value and a function over itself?
```

This habit is better than memorizing error messages. The checker is not
judging style. It is solving a constraint system and showing you where the
ledger stopped balancing.

## The Shape It Returns

I like principal types because they are a rare compiler artifact with humility.

They do not say:

```text
this is the only way to think about your program
```

They say:

```text
within this language of types, this is the least commitment that explains it
```

That is a beautiful kind of static analysis. The checker walks the syntax,
spends fresh variables, accumulates equations, refuses infinite self-reference,
and generalizes exactly at the boundary where reuse becomes sound.

The result feels like magic when it appears under your cursor:

```text
compose : forall 'a 'b 'c. ('a -> 'b) -> ('c -> 'a) -> 'c -> 'b
```

But it is not magic. It is accounting, done with taste.

## Further Reading

[^hindley]: R. Hindley, ["The Principal Type-Scheme of an Object in Combinatory Logic"](https://www.cs.tufts.edu/~nr/cs257/archive/roger-hindley/principal-type-scheme.pdf), *Transactions of the American Mathematical Society* 146, 29-60, 1969. The paper proves the principal type-scheme result in combinatory logic.

[^milner]: Robin Milner, ["A Theory of Type Polymorphism in Programming"](https://homepages.inf.ed.ac.uk/wadler/papers/papers-we-love/milner-type-polymorphism.pdf), *Journal of Computer and System Sciences* 17(3), 348-375, 1978. The paper presents the polymorphic type discipline behind ML and an inference algorithm based on W.

[^damas-milner]: Luis Damas and Robin Milner, ["Principal Type-Schemes for Functional Programs"](https://people.eecs.berkeley.edu/~necula/Papers/DamasMilnerAlgoW.pdf), POPL 1982, 207-212. DOI record: [10.1145/582153.582176](https://doi.org/10.1145/582153.582176).

[^robinson]: J. A. Robinson, ["A Machine-Oriented Logic Based on the Resolution Principle"](https://www.cs.tufts.edu/~nr/cs257/archive/john-alan-robinson/resolution.pdf), *Journal of the ACM* 12(1), 23-41, 1965. Robinson's paper made unification a central mechanism in machine-oriented deduction.

[^wright]: Andrew K. Wright, ["Simple Imperative Polymorphism"](https://www.cs.tufts.edu/~nr/cs257/archive/andrew-wright/imperative-poly.pdf), *LISP and Symbolic Computation* 8, 343-355, 1995.

[^ocaml]: OCaml manual, ["Polymorphism and its limitations"](https://ocaml.org/manual/5.2/polymorphism.html). The manual discusses weak type variables and the value restriction in a production ML-family language.
