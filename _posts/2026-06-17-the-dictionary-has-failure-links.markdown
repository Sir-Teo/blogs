---
layout: post
title: "The Dictionary Has Failure Links"
description: "Aho-Corasick turns many string patterns into one automaton. The trick is not only a trie; it is knowing where to fall when a partial match breaks."
date: 2026-06-17 02:42:00 -0400
categories: computer-science
tags: [aho-corasick, string-matching, automata, tries, algorithms, text-search, software-engineering]
excerpt: "A trie tells you how to keep matching. Failure links tell you how not to start over."
---

Searching for one word is a small drama.

Searching for a dictionary is a scheduling problem.

Suppose the dictionary is:

```text
he
she
his
hers
```

and the stream says:

```text
ushers
```

At the `s` in `ushers`, both `she` and `he` are alive in different ways. At the
`r`, `hers` is still alive. A naive matcher can try every pattern at every
position and discover these facts by repetition.

Aho-Corasick stores the repetition.

The trie stores what has matched so far. Failure links store what remains true
after the next character disappoints you.

## A Trie Is Not Enough

A trie is the obvious first move. Put every keyword into one prefix tree:

```text
h -> e
  -> i -> s
s -> h -> e
          -> r -> s
```

Now a shared prefix is only stored once. Good.

But streaming search has a harder problem. If you are in the state for `sh` and
the next character is `e`, you have found `she`. If the next character had been
`i`, you should not restart the entire scan. The suffix `h` is still a prefix
of another keyword. It deserves to stay alive.

A failure link answers:

```text
if this prefix cannot be extended by the current character,
what is the longest suffix of this prefix that is also a trie prefix?
```

That sounds like a mouthful because it is doing careful bookkeeping. It is the
multi-pattern cousin of KMP's border table. KMP remembers fallback positions
inside one pattern. Aho-Corasick remembers fallback positions inside a whole
dictionary trie.

Aho and Corasick's 1975 paper describes the algorithm as constructing a finite
state pattern-matching machine from the keywords and then applying the text as
input to that machine.[^aho-acm] The important promise is that the text pointer
does not move backward. The machine changes state; the stream keeps going.

## The Output Function Is a Separate Thing

One small detail is easy to miss.

Reaching a node does not necessarily mean there is only one output.

In a dictionary such as:

```text
GAT
GATA
TATA
```

one ending position can report several patterns, because shorter patterns may
be suffixes of longer ones. The automaton's output function has to include:

```text
patterns that end at this trie node
patterns inherited through failure links
```

This is why practical libraries expose choices about match semantics. The Rust
`aho-corasick` crate, for example, documents multiple-pattern search through a
finite state machine and exposes different match kinds for use cases that want
standard overlapping matches, leftmost-first matches, or leftmost-longest
matches.[^rust-docs]

The mathematical automaton can report everything.

The product API still has to decide what "everything" means for replacement,
highlighting, tokenization, or moderation.

## The Lab

The lab below builds the automaton directly. It shows four things:

```text
trie edges:       solid green character transitions
failure links:   red suffix fallbacks
stream trace:    one pass over generated text
work ledger:     naive comparisons versus automaton work
```

It also computes a dense DFA table for comparison. The sparse failure-link
machine has fewer stored transitions but may take extra fallback steps. A filled
DFA precomputes those fallbacks into every state/character transition, so search
can be one table lookup per byte, but the table is larger.

The Rust implementation notes make exactly this kind of engineering tradeoff:
users can choose NFAs or a DFA, and the design discusses contiguous
representations, dense transitions, memory, and speed.[^rust-design] Hyperscan,
a production multiple-regex matcher, goes much further with hybrid automata and
CPU-oriented decomposition; the point here is the small exact core, not the full
industrial stack.[^hyperscan]

<style>
  .ac-lab {
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

  .ac-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 1rem;
  }

  .ac-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .ac-lab label span {
    color: #5d6872;
    font-size: 0.76rem;
    font-weight: 560;
  }

  .ac-lab select,
  .ac-lab input[type="range"] {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    max-width: 100%;
    width: 100%;
  }

  .ac-lab select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    min-height: 2.35rem;
    padding: 0.35rem 0.5rem;
  }

  .ac-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0 0 1rem;
  }

  .ac-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    min-width: 0;
    padding: 0.7rem 0.75rem;
  }

  .ac-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 680;
    letter-spacing: 0;
    line-height: 1.2;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }

  .ac-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.9rem, 2.5vw, 1.1rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .ac-lab__metric.good strong {
    color: #0f766e;
  }

  .ac-lab__metric.warn strong {
    color: #d97706;
  }

  .ac-lab__metric.bad strong {
    color: #be123c;
  }

  .ac-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .ac-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
    margin: 0.8rem 0 0;
  }

  @media (max-width: 640px) {
    .ac-lab {
      padding: 0.75rem;
    }

    .ac-lab__controls {
      grid-template-columns: 1fr;
    }
  }
</style>

<div id="aho-corasick-lab" class="ac-lab" data-aho-corasick-lab>
  <div class="ac-lab__controls">
    <label>
      Dictionary
      <select data-param="dictionary" aria-label="Pattern dictionary">
        <option value="classic" selected>classic overlaps</option>
        <option value="logs">log alarms</option>
        <option value="dna">dna motifs</option>
      </select>
      <span data-value="dictionary">classic overlaps</span>
    </label>
    <label>
      Stream length
      <input type="range" min="48" max="240" step="4" value="120" data-param="length" aria-label="Generated stream length">
      <span><output data-value="length">120</output> chars</span>
    </label>
    <label>
      Overlap pressure
      <input type="range" min="0" max="100" step="1" value="55" data-param="overlap" aria-label="Overlap pressure">
      <span data-value="overlap">55%</span>
    </label>
    <label>
      Seed
      <input type="range" min="1" max="9999" step="1" value="17" data-param="seed" aria-label="Random seed">
      <span data-value="seed">17</span>
    </label>
  </div>
  <div class="ac-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="760" aria-label="Aho-Corasick lab showing trie edges, failure links, one-pass stream trace, work ledger, and output counts"></canvas>
  <p class="ac-lab__note">
    Exact substring matching only. The audit compares every Aho-Corasick match
    against a naive all-pattern scan across generated classic, log, and DNA
    streams.
  </p>
</div>

<script defer src="{{ '/assets/js/aho-corasick-lab.js?v=20260617b' | relative_url }}"></script>

## What the Failure Link Buys

The failure link is not an error handler. It is a cached theorem:

```text
this shorter prefix is still compatible with the suffix just seen
```

When the sparse machine cannot follow a character edge, it falls through failure
links until it reaches a state that can consume that character, or returns to
the root. That sounds like it could be expensive, but the stream-position does
not move backward. The state can only fall after it previously climbed through
matched characters. The usual amortized story is the same kind of story that
makes KMP linear.

A dense DFA makes a different bargain. It asks, ahead of time:

```text
from every state, for every alphabet character, where would the sparse machine land?
```

Then search is simple:

```text
state = table[state][char]
emit output[state]
```

That can be fast and predictable, especially when the alphabet is small and the
machine fits cache. It can also be too large. The table size is roughly:

```text
states * alphabet
```

while the sparse trie stores only explicit character edges plus failure links.
The right representation depends on pattern count, alphabet, cache behavior,
match semantics, and build-time budget.

This is why "use Aho-Corasick" is not a single implementation decision. It is a
family of automata layouts.

## When Outputs Stack

The DNA dictionary in the lab includes both:

```text
GAT
GATA
```

If the stream contains `GATA`, a standard all-matches automaton reports both.
That is the mathematically clean output.

But consider a replacement API:

```text
replace ["GAT", "GATA"] with ...
```

Should it replace `GAT` first? Prefer `GATA` because it is longer? Prefer the
pattern listed earlier? Report both and let the caller decide?

Those are not automaton questions. They are policy questions on top of the
automaton.

This distinction matters in real text systems:

```text
syntax highlighters
tokenizers
moderation filters
intrusion signatures
DNA motif scanners
log alerting rules
bulk literal replacement
```

In each case, the automaton can find candidate facts. The application decides
which candidates are allowed to overlap, suppress, rewrite, or escalate.

## Why This Still Feels Modern

Aho-Corasick is old enough to look like textbook furniture. It should not feel
old.

It has the same shape as many modern systems:

```text
compile a large set of rules into a reusable state machine
stream data through it once
emit all local events without rescanning
choose a memory layout for the hardware you actually have
```

Hyperscan's NSDI paper describes a far more elaborate version of that world:
large-scale regular-expression matching decomposed into string and automata
components, with modern CPU optimizations layered on top.[^hyperscan] The
original exact-keyword algorithm is not the whole story, but it is one of the
cleanest ancestors of the story.

The moral I keep is small:

```text
a failed partial match is not wasted work
```

If you can name what remains true after a failure, you can store that fact as a
link. The next character does not have to retry the past. It can inherit it.

## Reproducibility Notes

The executable artifact is
[`assets/js/aho-corasick-lab.js`]({{ '/assets/js/aho-corasick-lab.js' | relative_url }}).

The implementation builds:

```text
trie next edges
failure links by breadth-first traversal
output lists inherited through failure links
a sparse scanner with explicit failure steps
a dense transition table for memory comparison
a naive all-pattern scanner for audit
```

The self-test runs `135` generated cases:

```text
3 dictionaries * 5 seeds * 3 stream lengths * 3 overlap settings
```

For each case, it verifies that Aho-Corasick and the naive scan report the same
`(start, end, pattern)` triples.

[^aho-acm]: Alfred V. Aho and Margaret J. Corasick, ["Efficient string matching: an aid to bibliographic search"](https://dl.acm.org/doi/10.1145/360825.360855), *Communications of the ACM*, 1975. A PDF is mirrored at [cr.yp.to](https://cr.yp.to/bib/1975/aho.pdf).

[^rust-docs]: Andrew Gallant, [`aho-corasick` crate documentation](https://docs.rs/aho-corasick), docs.rs.

[^rust-design]: Andrew Gallant, [`aho-corasick` design notes](https://github.com/BurntSushi/aho-corasick/blob/master/DESIGN.md), especially the discussion of NFA and DFA representations.

[^hyperscan]: Xiang Wang, Yang Hong, Harry Chang, KyoungSoo Park, Geoff Langdale, Jiayu Hu, and Heqing Zhu, ["Hyperscan: A Fast Multi-pattern Regex Matcher for Modern CPUs"](https://www.usenix.org/system/files/nsdi19-wang-xiang.pdf), NSDI 2019. Intel's developer introduction is also useful: [Introduction to Hyperscan](https://www.intel.com/content/www/us/en/developer/articles/technical/introduction-to-hyperscan.html).
