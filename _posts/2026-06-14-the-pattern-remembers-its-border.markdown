---
layout: post
title: "Search That Refuses to Reread"
description: "KMP string search is linear because a mismatch leaves evidence behind. The failure table remembers which prefix is also a suffix."
date: 2026-06-14 14:44:00 -0400
categories: computer-science
tags: [kmp, string-matching, algorithms, automata, failure-functions, computer-science]
excerpt: "A mismatch is not a clean slate. If the matched prefix has a border, the pattern already knows where the next attempt begins."
---

There is a little humiliation in naive string search.

You line up a pattern against a text, compare characters left to right, and when
one character disagrees you move the pattern one cell and start again. The code
is innocent:

```text
for shift in 0..n-m:
  compare P[0], P[1], ... against T[shift], T[shift+1], ...
```

It is also a little rude to the text. It asks the same characters to testify
again and again as if the failed comparison told it nothing.

Knuth, Morris, and Pratt's string-matching algorithm, published in 1977, is a
cure for that forgetfulness.[^kmp] The idea is not to be clever about the text.
The idea is to make the pattern remember itself.

That remembered thing is called a **border**.

A border of a string is a non-empty prefix that is also a suffix, usually
required to be proper so it is not the whole string. For example:

```text
ababaca
```

has prefixes:

```text
a, ab, aba, abab, ababa, ababac, ababaca
```

and suffixes:

```text
a, ca, aca, baca, abaca, babaca, ababaca
```

The full string has border `a`. The prefix `ababa` has border `aba`. These
small coincidences are exactly the information that survives a mismatch.

## The Mismatch Did Some Work

Suppose the search has just matched the first `q` characters of the pattern
against the suffix of the text read so far:

$$
P[0:q] = T[i-q+1:i+1].
$$

Now the next character disagrees:

$$
P[q] \ne T[i+1].
$$

The naive scan throws away the whole matched prefix and moves the pattern one
position. KMP asks a narrower question:

> Which suffix of the matched prefix is also a prefix of the pattern?

If that suffix has length `r`, then the next legal state is not zero. It is
`r`. The text suffix of length `r` is already known to match the pattern prefix
of length `r`; no character has to be reread to prove it.

The prefix table, often written as `pi`, stores this answer for every prefix:

```text
pi[i] = length of the longest proper border of P[0:i+1]
```

For the classic teaching pattern:

```text
P:  a b a b a c a
pi: 0 0 1 2 3 0 1
```

The number `3` under the fifth character says that `ababa` contains a reusable
border of length three:

```text
ababa
aba
  aba
```

So if we have matched `ababa` and the next character fails, we do not return to
the beginning. We fall back to state `3`, meaning "the text suffix already looks
like `aba`."

That is the whole trick, but it is easy to understate it. KMP is not merely
skipping a few alignments. It is maintaining an invariant about the longest
pattern prefix that is a suffix of the text consumed so far. The search state is
the length of that prefix.

In pseudocode, the scan is almost too small:

```text
q = 0
for c in text:
  while q > 0 and P[q] != c:
    q = pi[q-1]
  if P[q] == c:
    q += 1
  if q == len(P):
    emit a match
    q = pi[q-1]
```

The text index only moves forward. A single text character can trigger a short
chain of fallbacks, but those fallbacks are paid for by earlier increases of
`q`. This is the amortized argument behind the linear bound.

## Make the Mismatch Pay Rent

The lab below compares ordinary left-to-right alignment with KMP. The default
case is intentionally unfair to the naive algorithm: a pattern like `aaaaaaaab`
searched inside a long run of `a`s. Every alignment almost succeeds and then
fails on the last character.

Change the text family and plant matches to see a different story. On log-like
text there is less self-overlap, so the gap narrows and KMP can even spend a
few extra comparisons for its guarantee. On overlapping patterns, the failure
links do visible work. The two matchers should always report the same match
positions; the experiment is only about how much comparison work each algorithm
spends to get there.

<div class="kmp-lab" data-kmp-lab>
  <div class="kmp-lab__controls">
    <label>
      Text family
      <select data-param="scenario" aria-label="Text family">
        <option value="run" selected>Repeated run</option>
        <option value="overlap">Overlapping word</option>
        <option value="logs">Log stream</option>
        <option value="dna">DNA-ish motif</option>
      </select>
    </label>
    <label>
      Text length <output data-value="textLength">220</output>
      <input type="range" data-param="textLength" min="80" max="360" step="10" value="220" aria-label="Text length">
    </label>
    <label>
      Pattern length <output data-value="patternLength">10</output>
      <input type="range" data-param="patternLength" min="5" max="18" step="1" value="10" aria-label="Pattern length">
    </label>
    <label>
      Planted matches
      <select data-param="plants" aria-label="Planted matches">
        <option value="none" selected>None</option>
        <option value="sparse">Sparse</option>
        <option value="dense">Dense</option>
      </select>
    </label>
    <label>
      Trace focus <output data-value="focus">55</output>
      <input type="range" data-param="focus" min="0" max="100" step="1" value="55" aria-label="Trace focus">
    </label>
  </div>
  <div class="kmp-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="KMP border lab comparing naive string search with prefix-function fallback search"></canvas>
  <div class="kmp-lab__legend">
    <span><i style="background:#b45309"></i>Naive alignment cost</span>
    <span><i style="background:#0f766e"></i>KMP state and per-character comparisons</span>
    <span><i style="background:#be123c"></i>Fallback jump</span>
    <span><i style="background:#2563eb"></i>Reusable border</span>
    <span><i style="background:#7c3aed"></i>Match emission</span>
  </div>
  <p class="kmp-lab__note">
    The counts are exact for the JavaScript implementations behind this page.
    The default repeated-run case uses a near-miss text, so the naive matcher
    repeats almost the whole pattern at many shifts while KMP moves through the
    text once.
  </p>
</div>

<script src="{{ '/assets/js/kmp-border-lab.js' | relative_url }}"></script>

For the default run, the lab builds the pattern `aaaaaaaaab`, whose prefix table
is:

```text
0 1 2 3 4 5 6 7 8 0
```

On a 220-character run of `a`s with no planted matches, the naive scan spends
`2,110` comparisons. KMP spends `431`, takes `211` fallback jumps, and reports
the same empty match list. I also swept 144 combinations of scenario, planting,
text length, and pattern length; every case agreed on match positions. In 12 of
those cases, mostly log-like low-overlap text, KMP spent more raw comparisons
than the naive scan. That is not a contradiction. KMP buys a streaming
worst-case guarantee, not a universal comparison discount.

## The Table Is a Tiny Automaton

The prefix table can feel like a bag of magic numbers until you read it as a
compressed automaton.

Imagine a deterministic machine whose state is:

```text
how many pattern characters have matched as a suffix of the text so far?
```

State `0` means no useful suffix is currently alive. State `5` for
`ababaca` means the current text suffix is `ababa`. If the next text character
is `c`, the machine advances to state `6`. If the next character is not `c`,
the machine should jump to the longest border state that is still consistent
with everything already seen.

The full automaton would have a transition for every state and every alphabet
character. KMP stores only the failure structure that is needed when the next
pattern character fails. The ordinary successful transition is just `q -> q+1`.

That is why the construction time is proportional to the pattern length and the
scan time is proportional to the text length. The original KMP paper states the
result as an algorithm that finds all occurrences of one string within another
in time proportional to the sum of their lengths, with a low enough constant to
be practical.[^kmp] The practical part matters: asymptotic linearity is not
useful if the constant hides a giant machine.

There is a second way to say the same thing:

```text
KMP never asks the text to repeat itself.
```

The pattern may back up inside its own memory. The text stream does not.

That streaming property is why KMP still feels modern. You can search a file,
a socket, a decompressed stream, or a log tail without buffering the whole text
or rewinding the input. The state is just `q` plus the pattern table.

## Worst Cases Have Rhythm

The unpleasant naive case is not random. It is periodic.

Take:

```text
P = aaaaaaaab
T = aaaaaaaaaaaaaaaaaaaaaaaaa...
```

At shift zero the naive matcher compares eight `a`s successfully and fails on
`b`. At shift one it does the same thing. At shift two it does the same thing.
The text is giving the same partial proof over and over.

The border table says something sharper. After matching `aaaaaaaa`, the longest
border is `aaaaaaa`; after the mismatch on `b`, KMP falls back to that border,
then checks the same current text character against the next pattern position.
It may fall again, but each fall shortens the remembered prefix. The state is
monotone in an amortized sense: it can climb at most once per consumed character
and can only fall as much as it previously climbed.

That makes KMP a good example of a general algorithmic move:

```text
replace repeated external work with internal state that summarizes it
```

The summary is not approximate. It is exact because borders are exactly the
parts of the proof that remain true after a mismatch.

## Neighbors From the Same Decade

KMP arrived in a crowded and productive era for string matching. Aho and
Corasick published their multiple-keyword algorithm in 1975.[^aho] It builds a
finite-state pattern-matching machine from a set of keywords and then processes
the text in one pass. Its failure links are the multi-pattern cousin of KMP's
border fallbacks: when one trie path fails, the automaton follows a suffix link
to the longest keyword prefix that could still match.

Boyer and Moore's 1977 algorithm walks from the other side.[^bm] It compares
characters from the end of the pattern and uses mismatch information to shift
the pattern by more than one position. That family often wins in ordinary
single-pattern searching because skipping text is powerful. KMP's strength is
the simpler worst-case streaming guarantee: it never needs to move the text
pointer backward, and it does not depend on a lucky alphabet or rare pattern
characters.

These are not rival slogans so much as different engineering bets:

```text
KMP:          remember borders; never rewind the stream
Aho-Corasick: remember borders over a trie of many patterns
Boyer-Moore:  inspect from the right; use mismatches to skip alignments
```

Modern substring search in standard libraries and databases is usually hybrid.
Implementations may use vectorized byte filters, bad-character skips, two-way
critical factorizations, cache-aware loops, or special paths for short needles.
So the lesson is not "handwrite KMP everywhere." The lesson is more durable:
the shape of the pattern can be precomputed into a small piece of memory, and
that memory changes the operational meaning of a mismatch.

## The Planner I Want

Here is the part that still feels alive to me.

We usually teach string matching as a solved taxonomy of algorithms. But
production search is full of distributional questions:

- Is the text a stream, a memory-mapped file, a columnar buffer, or compressed
  blocks?
- Is the pattern short enough for SIMD filters to dominate?
- Does the pattern have high border depth, low alphabet entropy, or many
  repeated bytes?
- Are we searching once, or amortizing preprocessing over millions of texts?
- Do we need all matches, first match, approximate matches, or many patterns?

Those questions suggest an adaptive string-search planner: inspect cheap
features of the pattern and the input source, then choose among KMP-like
fallback memory, Boyer-Moore-like skips, Aho-Corasick automata, vectorized
prefilters, or verification kernels. The hard part is not inventing yet another
asymptotic bound. It is building a reliable cost model that sees caches,
branching, alphabet structure, and the penalty of false-positive filters.

The small lab above is a toy version of that planner. It measures one feature:
how much work border memory saves over naive realignment. A fuller experiment
would add cache-miss counters, SIMD prefilters, pattern entropy, and a corpus of
real log, source-code, DNA, and packet traces. Then the failure function would
be one candidate in a portfolio rather than the whole story.

That is a nice fate for a classic algorithm. It does not have to be the final
answer to remain a clean piece of machinery. KMP teaches the thing that should
survive every implementation detail:

```text
a mismatch is information;
the right state lets you keep it
```

[^kmp]: Donald E. Knuth, James H. Morris Jr., and Vaughan R. Pratt, ["Fast Pattern Matching in Strings"](https://epubs.siam.org/doi/10.1137/0206024), *SIAM Journal on Computing* 6(2), 1977.

[^aho]: Alfred V. Aho and Margaret J. Corasick, ["Efficient string matching: an aid to bibliographic search"](https://dl.acm.org/doi/10.1145/360825.360855), *Communications of the ACM* 18(6), 1975. A public copy is also hosted at [cr.yp.to](https://cr.yp.to/bib/1975/aho.pdf), and NIST's Dictionary of Algorithms and Data Structures has a concise entry for [Aho-Corasick](https://xlinux.nist.gov/dads/HTML/ahoCorasick.html).

[^bm]: Robert S. Boyer and J Strother Moore, ["A fast string searching algorithm"](https://dl.acm.org/doi/10.1145/359842.359859), *Communications of the ACM* 20(10), 1977.
