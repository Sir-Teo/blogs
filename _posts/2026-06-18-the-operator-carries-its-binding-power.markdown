---
layout: post
title: "The Operator Carries Its Binding Power"
description: "Pratt parsing turns expression grammar into a table of token behaviors: each token knows how to start an expression, how to extend one, and how tightly it binds."
date: 2026-06-18 02:43:00 -0400
categories: computer-science
tags: [pratt-parser, parsing, expression-parsers, binding-power, compilers, algorithms]
excerpt: "The parser does not need a function per precedence level. It needs one loop, a table of token behaviors, and a strict question: does the next operator bind tighter than the caller's right binding power?"
---

An expression parser has to answer a local custody dispute.

In:

```text
a + b * c
```

the operand `b` is between `+` and `*`. Does it belong to the addition on the
left, or to the multiplication on the right?

Humans answer with a precedence convention. A common recursive descent parser
answers by building a tower of functions:

```text
expression -> term
term       -> factor (("+" | "-") factor)*
factor     -> power  (("*" | "/") power)*
power      -> unary  ("^" power)?
unary      -> "-" unary | primary
primary    -> number | name | "(" expression ")"
```

That works. It is also a little embarrassing. The grammar becomes a staircase
whose shape is mostly determined by an operator table.

Pratt's 1973 top-down operator precedence parser takes the table seriously.[^pratt]
Instead of writing one parser function per precedence level, it asks each token
two questions:

```text
nud: what do you mean when you start an expression?
led: what do you mean when an expression is already on your left?
```

The token `-` can answer both. As a `nud`, it is unary negation. As a `led`, it
is binary subtraction. The token `(` can start a grouped expression, and in a
larger language it might also extend an expression as a function call.

Then one loop does most of the work.

```js
function expression(rbp) {
  const t = advance();
  let left = nud(t);

  while (rbp < lbp(peek())) {
    const op = advance();
    left = led(op, left);
  }

  return left;
}
```

Here `rbp` is the right binding power requested by the caller, and `lbp` is the
left binding power of the next token. Pratt's original paper describes this
state machine in terms of null and left denotations, and makes the binding-power
comparison the point where the parser decides whether to keep extending the
current expression or return to its caller.[^pratt-implementation] Crockford's
JavaScript presentation uses the same compact `expression(rbp)` shape and helped
make the technique visible to modern JavaScript readers.[^crockford]

The parser is small because the hard question is not hidden. It is right there:

```text
should the next token bind tighter than the caller's rbp?
```

## Associativity Is A One-Number Difference

Suppose `+` has left binding power `10`, `*` has `20`, and `^` has `30`.

For a left-associative operator such as `+`, the `led` function parses its right
operand at the same binding power:

```js
led("+", left):
  right = expression(10)
  return ["+", left, right]
```

That means the right operand stops before another `+`, because the loop tests a
strict inequality:

```text
10 < lbp("+") = 10     false
```

So:

```text
a - b - c
```

becomes:

```text
(- (- a b) c)
```

For a right-associative operator in this integer-table variant, the `led`
function asks for the right operand at one less than its own left binding power:

```js
led("^", left):
  right = expression(29)
  return ["^", left, right]
```

Now a second `^` is allowed into the right operand:

```text
29 < lbp("^") = 30     true
```

So:

```text
a ^ b ^ c
```

becomes:

```text
(^ a (^ b c))
```

Other presentations use different numeric conventions. In *Crafting
Interpreters*, the C bytecode compiler parses left-associative binary right
operands at the next higher precedence level, while right-associative operators
would use the same level.[^crafting] That is the same idea with a different
table encoding: the recursive call chooses which future operators are allowed
to join the right side.

## Walk One Parse

For:

```text
a + b * c
```

the standard table below uses:

```text
+ -   lbp 10
* /   lbp 20
^     lbp 30
postfix ! lbp 40
```

The trace is:

```text
expression(0)
  nud(a) -> a
  0 < lbp(+) = 10, take +
    led(+) asks for expression(10)
      nud(b) -> b
      10 < lbp(*) = 20, take *
        led(*) asks for expression(20)
          nud(c) -> c
          20 < lbp(end) = 0, stop
      return (* b c)
  return (+ a (* b c))
```

If `+` and `*` are deliberately assigned the same binding power, the same token
stream becomes:

```text
(* (+ a b) c)
```

No parser function changed. The grammar did not grow a new layer. The table
changed, so the local custody dispute changed.

## The Browser Lab

The lab implements a tiny expression language with names, numbers, grouping,
prefix `+` and `-`, postfix `!`, left-associative `+ - * /`, and switchable
associativity for `^`. The environment for displayed numeric values is:

```text
a=2, b=3, c=4, d=2
```

The interesting control is not the example selector. It is the table selector.
Use `flat + and *` to make addition and multiplication tie. Use `left-assoc ^`
to change only exponentiation's recursive right binding power.

<style>
  .pratt-lab {
    border: 1px solid #d7dee5;
    padding: 1rem;
    margin: 1.5rem 0;
    background: #ffffff;
  }

  .pratt-lab__controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 0.9rem;
  }

  .pratt-lab__controls label {
    display: grid;
    gap: 0.35rem;
    color: #172026;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .pratt-lab__controls select,
  .pratt-lab__controls input {
    width: 100%;
  }

  .pratt-lab__controls output {
    color: #5d6872;
    font-weight: 500;
  }

  .pratt-lab__metrics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.55rem;
    margin-bottom: 0.9rem;
  }

  .pratt-lab__metric {
    border: 1px solid #d7dee5;
    background: #f8fafc;
    padding: 0.55rem 0.65rem;
    min-width: 0;
  }

  .pratt-lab__metric span {
    display: block;
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .pratt-lab__metric strong {
    display: block;
    color: #172026;
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.25;
    margin-top: 0.2rem;
    overflow-wrap: anywhere;
  }

  .pratt-lab__metric--good strong {
    color: #0f766e;
  }

  .pratt-lab__metric--bad strong {
    color: #be123c;
  }

  .pratt-lab canvas {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid #d7dee5;
    background: #ffffff;
  }

  .pratt-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 760px) {
    .pratt-lab {
      padding: 0.75rem;
    }

    .pratt-lab__controls,
    .pratt-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="pratt-lab" data-pratt-parser-lab>
  <div class="pratt-lab__controls">
    <label>
      Expression
      <output data-value="example">a + b * c</output>
      <select data-param="example" aria-label="Expression example">
        <option value="simple" selected>a + b * c</option>
        <option value="ladder">a + b * c ^ d</option>
        <option value="grouped">(a + b) * c</option>
        <option value="leftChain">a - b - c</option>
        <option value="powerChain">a ^ b ^ c</option>
        <option value="unaryPostfix">-a ^ b!</option>
      </select>
    </label>
    <label>
      Binding table
      <output data-value="mode">standard powers</output>
      <select data-param="mode" aria-label="Binding table">
        <option value="standard" selected>standard powers</option>
        <option value="flat">flat + and *</option>
        <option value="leftPower">left-assoc ^</option>
      </select>
    </label>
    <label>
      Trace step
      <output data-value="traceStep">0 / 0</output>
      <input type="range" min="0" max="1" step="1" value="999" data-param="traceStep" aria-label="Trace step">
    </label>
  </div>
  <div class="pratt-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="680" aria-label="Pratt parser lab showing token stream, abstract syntax tree, binding powers, and a parser trace ledger"></canvas>
  <p class="pratt-lab__note" data-note></p>
</div>

<script defer src="{{ '/assets/js/pratt-parser-lab.js?v=20260618c' | relative_url }}"></script>

## What The Default Run Checks

The default expression is:

```text
a + b * c
```

With the standard table, the rendered AST is:

```text
(+ a (* b c))
```

The trace contains the decisive comparison:

```text
10 < lbp(*) = 20     take
```

That comparison happens inside the right operand of `+`. It is why the
multiplication is admitted before the addition node is closed.

Switch the table to `flat + and *`, and the comparison changes:

```text
20 < lbp(*) = 20     stop
```

The `*` waits for the outer call, and the AST becomes:

```text
(* (+ a b) c)
```

The parser did not "forget" arithmetic. It obeyed a different local contract.

## Reproducibility Check

The browser lab is also a CommonJS module:

```bash
node - <<'NODE'
const lab = require("./assets/js/pratt-parser-lab.js");
const audit = lab.auditGrid();
console.table(audit.byMode);
console.table(audit.byExample);
console.table(audit.criticalChecks);
if (audit.total !== 25 || audit.totalChecks !== 188) {
  throw new Error(`unexpected audit size: ${audit.total} cases, ${audit.totalChecks} checks`);
}
if (!audit.ok || audit.passed !== audit.total || audit.passedChecks !== audit.totalChecks) {
  throw new Error(JSON.stringify(audit.errors, null, 2));
}
console.log(`${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`);
NODE
```

The current audit grid has 25 cases and 188 individual checks. It verifies:

- every example under all three binding tables;
- standard multiplication binding tighter than addition;
- the deliberate flat-table parse change;
- parentheses overriding the table;
- left-associative subtraction chains;
- right-associative and left-associative exponent chains;
- prefix and postfix composition in `-a ^ b!`;
- full token consumption;
- finite evaluation in the displayed teaching environment; and
- the presence of both `nud` events and binding-power stop decisions in the
  trace.

The implementation is intentionally small:
[`assets/js/pratt-parser-lab.js`]({{ '/assets/js/pratt-parser-lab.js' | relative_url }}).

## Where The Toy Stops

This is not a full language front end.

The tokenizer is tiny. Error recovery is fail-fast. There are no assignments,
calls, subscripts, ternaries, statement forms, or contextual keywords. A serious
compiler also has to decide how parsing interacts with types, scopes, diagnostics,
incremental editing, and source spans.

That said, Pratt parsing scales surprisingly well into real tools. Crockford
used a TDOP parser style in his JavaScript work.[^crockford] Nystrom's articles
and *Crafting Interpreters* present the same family of ideas as parselets and
parse-rule tables, which make it easy to see which tokens can start or extend an
expression.[^nystrom][^crafting] Desmos has also written publicly about adopting
Pratt parsing for mathematical expressions in the browser.[^desmos]

The core reason is the same reason the toy is useful: expression syntax is not
only a context-free grammar problem. It is a table of small token-local behaviors
plus a binding comparison. When that table is visible, changes to the language
become auditable:

```text
which tokens can start?
which tokens can extend?
how tightly do they hold the expression on their right?
```

That is a good interface between language design and parser implementation.

[^pratt]: Vaughan R. Pratt, ["Top Down Operator Precedence"](https://tdop.github.io/), originally presented at POPL 1973. ACM DOI: [10.1145/512927.512931](https://dl.acm.org/doi/10.1145/512927.512931).

[^pratt-implementation]: Pratt's implementation section introduces the `rbp < lbp` test and the `nud` / `led` split for tokens with and without a preceding expression. See ["Top Down Operator Precedence", Section 3](https://tdop.github.io/).

[^crockford]: Douglas Crockford, ["Top Down Operator Precedence"](https://www.crockford.com/javascript/tdop/tdop.html), 2007.

[^nystrom]: Bob Nystrom, ["Pratt Parsers: Expression Parsing Made Easy"](https://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/), 2011.

[^crafting]: Bob Nystrom, ["Compiling Expressions"](https://craftinginterpreters.com/compiling-expressions.html), *Crafting Interpreters*.

[^desmos]: Desmos Engineering, ["How Desmos uses Pratt Parsers"](https://engineering.desmos.com/articles/pratt-parser/), 2018.
