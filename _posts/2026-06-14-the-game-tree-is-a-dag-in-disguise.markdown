---
layout: post
title: "Game Trees Tell the Wrong Story"
description: "Alpha-beta search is drawn as a tree, but repeated positions make the real work a graph. A transposition table is safe only when it stores identity, depth, and bound type."
date: 2026-06-14 15:20:00 -0400
categories: gaming
tags: [game-ai, alpha-beta, transposition-tables, zobrist-hashing, chess-engines, dynamic-programming]
excerpt: "A game position is not the path that reached it. Transposition tables exploit that fact, but a cached score is a typed claim, not a loose number in a hash table."
---

The search tree is a useful lie.

It tells the truth just long enough to teach the algorithm, then quietly starts
charging rent.

It says:

```text
position -> legal moves -> child positions -> more legal moves
```

That picture is useful. It is also incomplete. In many games, two different
move orders can reach the same position. Chess players call that a
transposition. A program that treats those histories as unrelated tree nodes
will solve the same subproblem again and again.

The better mental model is:

```text
move sequences form a tree
positions form a graph
```

The tree is made of stories. The graph is made of facts.

Claude Shannon's 1950 chess-programming paper already framed computer chess as
a search problem over possible continuations.[^shannon] Alpha-beta pruning then
gave the standard way to keep minimax search exact while refusing to inspect
branches that cannot affect the final choice. Knuth and Moore's 1975 analysis
is still the clean reference: alpha-beta is a value-preserving pruning rule, and
its behavior depends heavily on the order in which successors are examined.[^knuth]

Transposition tables add another kind of refusal:

```text
do not re-search a position whose relevant answer is already known
```

That sentence sounds like ordinary memoization. It is not quite ordinary
memoization, because alpha-beta often learns a bound rather than an exact value.
A table entry is not merely:

```text
position -> score
```

It is closer to:

```text
position, side to move, searched depth -> exact value or lower/upper bound
```

If the program forgets the type of claim it cached, the table stops being
memory and becomes rumor.

## Stories Repeat; Positions Do Not

Imagine a tiny game with five piles. A move removes one stone from one pile.
Starting from:

```text
A=4, B=4, C=4, D=4, E=4
```

the sequences:

```text
A then B then C
C then A then B
B then C then A
```

all arrive at the same state:

```text
A=3, B=3, C=3, D=4, E=4
```

If a search algorithm keys its memory by move sequence, those are three
different leaves in the story tree. If it keys by position and side to move,
they are one subproblem.

This is why transposition tables feel almost unfair in endgames and other
low-entropy regions. The move-order tree can still be enormous, but the number
of distinct positions reachable at a fixed depth may be much smaller. Breuker,
Uiterwijk, and van den Herik put it directly in their paper on transposition
table information: once transpositions are used, the search tree can be treated
as a search graph.[^breuker]

The distinction is not cosmetic. It changes the object being optimized. Without
the table, alpha-beta is saving branches. With the table, the program is also
recognizing repeated subproblems.

## The Cache Stores a Claim

Minimax asks for the value of a position under best play. Alpha-beta asks the
same question while carrying two promises:

```text
alpha: the side to move can already get at least this much elsewhere
beta:  the opponent can already hold the value below this much elsewhere
```

If a child position cannot beat those promises, search can stop. That cutoff is
exact, not heuristic. The pruned branch cannot change the value returned to the
parent.

But the value found at a cutoff is not always an exact value of the position.
Sometimes it says:

```text
this position is at least beta
```

or:

```text
this position is at most alpha
```

That is why mature transposition-table entries carry a flag: exact, lower
bound, or upper bound. Breuker et al. list the traditional fields as a key, best
move, score, flag, and search depth; the flag records whether the score is a
true value or a bound, and the depth records how deeply the position was
searched.[^breuker]

A shallow exact value may be useful for move ordering but not enough to answer a
deeper search. A lower bound may produce a cutoff if it already exceeds beta,
but it cannot be treated as an exact score. The bound type is part of the data.

This is the small engineering rule:

```text
cache the theorem you proved,
not the number you happened to return
```

## A Fingerprint Is Not a Face

A chess position is too large to use directly as a fast table index. Zobrist's
hashing method gives a beautifully practical workaround: assign random bit
patterns to board features, then combine the active features with XOR.[^zobrist]
Moving a piece updates the key incrementally by xoring out the old features and
xoring in the new ones.

For chess, those features include things like:

```text
piece type, color, square
side to move
castling rights
en passant state
```

For Go, checkers, or a planning state, the features differ, but the contract is
the same. The hash key is a compact fingerprint for the position.

Fingerprint is the right word. A hash key is not the position itself.

There are two different collision stories:

- **Index collision:** two keys map to the same table slot. This is normal in a
  finite table. A replacement policy decides which entry survives.
- **Key collision:** two different positions have the same stored signature.
  This is rarer with wide keys, but if the program trusts the signature without
  verification, it can retrieve a claim about the wrong position.

Zobrist's original report explicitly discussed auxiliary checks for retrieval
errors, with the error rate controlled by how much table space is devoted to the
check.[^zobrist] The point was not that hashing makes identity free. The point
was that identity can be made cheap enough for search, if the remaining risk is
engineered consciously.

## A Toy That Makes Transpositions Loud

The lab below is not a chess engine. It is a small deterministic game designed
to exaggerate transpositions. A move removes one stone from one pile, and the
leaf evaluator is deliberately synthetic. That makes the experiment transparent:
many move orders reach the same state, alpha-beta prunes by bounds, and the
transposition table decides how much repeated work survives.

There are three searches:

- **Alpha-beta:** no transposition table.
- **Full table:** an unlimited table keyed by the full state.
- **Limited table:** a direct-mapped Zobrist-style table with adjustable slots,
  key width, and optional full-state verification.

<div class="transposition-lab" data-transposition-lab>
  <div class="transposition-lab__controls">
    <label>
      Piles <output data-value="piles">5</output>
      <input type="range" data-param="piles" min="3" max="6" step="1" value="5" aria-label="Piles">
    </label>
    <label>
      Stones per pile <output data-value="stones">4</output>
      <input type="range" data-param="stones" min="2" max="6" step="1" value="4" aria-label="Stones per pile">
    </label>
    <label>
      Search depth <output data-value="depth">10</output>
      <input type="range" data-param="depth" min="4" max="14" step="1" value="10" aria-label="Search depth">
    </label>
    <label>
      Move ordering
      <select data-param="ordering" aria-label="Move ordering">
        <option value="helpful" selected>Helpful</option>
        <option value="natural">Natural</option>
        <option value="hostile">Hostile</option>
      </select>
    </label>
    <label>
      Table slots <output data-value="tableSize">512</output>
      <select data-param="tableSize" aria-label="Table slots">
        <option value="64">64</option>
        <option value="128">128</option>
        <option value="256">256</option>
        <option value="512" selected>512</option>
        <option value="1024">1024</option>
        <option value="2048">2048</option>
        <option value="4096">4096</option>
      </select>
    </label>
    <label>
      Hash key bits <output data-value="keyBits">16</output>
      <input type="range" data-param="keyBits" min="8" max="32" step="1" value="16" aria-label="Hash key bits">
    </label>
    <label>
      Verify full state
      <select data-param="verify" aria-label="Verify full state">
        <option value="yes" selected>Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  </div>
  <div class="transposition-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Transposition table simulator comparing alpha-beta search, full memoization, limited hash tables, collisions, and root move values"></canvas>
  <div class="transposition-lab__legend">
    <span><i style="background:#be123c"></i> Alpha-beta tree work</span>
    <span><i style="background:#0f766e"></i> Distinct positions</span>
    <span><i style="background:#2563eb"></i> Full transposition table</span>
    <span><i style="background:#7c3aed"></i> Limited hash table</span>
    <span><i style="background:#b45309"></i> Collision pressure</span>
  </div>
  <p class="transposition-lab__note">
    Deterministic browser experiment. The direct-mapped table stores depth,
    value, bound flag, best move, and a truncated Zobrist-style key. The Audit
    tile is generated by the same JavaScript: 17 deterministic checks cover the
    default headline numbers, collision handling, and a 288-case parameter grid.
  </p>
</div>

<script defer src="{{ '/assets/js/transposition-table-lab.js?v=20260617b' | relative_url }}"></script>

At the default setting, the frontier panel has the important smell: 8,166,900
move sequences collapse to 381 distinct states at depth ten. Alpha-beta still
prunes many branches, but it remains sensitive to repeated work: 58,626 visited
nodes without a table, 3,740 with the full table, and 5,820 with the limited
table. The graph structure is not a metaphor. It is saved work.

Now try three small experiments.

First, set **Move ordering** to **Hostile**. Alpha-beta becomes less lucky. The
full table still benefits from the fact that the underlying state graph did not
change.

Second, lower **Table slots**. Overwrites rise. This is not a correctness bug by
itself. It means useful memory is being evicted. The search may do more work,
and shallow or unlucky entries may survive while deeper ones are lost.

Third, set **Hash key bits** to 8 and **Verify full state** to **No**. The lab
will eventually report false hits. The table has begun accepting cached claims
about positions that merely share a small fingerprint. Turn verification back on
and those same collisions become rejected misses instead of wrong evidence.

That last switch is the core lesson. A cache miss is disappointing. A false hit
is dangerous.

## What Has To Be Part of Identity

The position key must name every fact that can affect the legal moves or the
value being searched.

For chess, a piece placement diagram is not enough. The side to move matters.
Castling rights matter. En passant rights matter. The halfmove clock and
repetition state may matter depending on how the engine handles draw rules. If
two states have the same pieces on the same squares but different legal futures,
they are not the same search state.

Some games make this nastier. In Go, ko and superko rules can make history
matter. In planning systems, resource locks, cooldowns, random seeds, hidden
information, or unresolved promises can make two visually identical states
search-different. A transposition table is only as correct as the equivalence
relation behind its key.

The practical test is blunt:

```text
if I replace this state by a cached entry,
will all legal continuations and terminal values remain valid?
```

If the answer is no, the key is missing state.

## Write Down the Theorem You Proved

The lab stores five pieces of information:

- a key, used to recognize the position;
- a depth, saying how much future search the claim covers;
- a value;
- a flag, saying exact, lower bound, or upper bound;
- a best move, useful for move ordering even when the value is too shallow.

Those fields correspond closely to the traditional transposition-table
components studied by Breuker et al.[^breuker] The key is not just a hash-table
convenience. The depth and flag are semantic guards. They decide when a stored
value is strong enough to replace search, when it can tighten alpha or beta, and
when it should merely suggest which move to try first.

This is why transposition tables are a good antidote to a common caching
mistake. Caches are often taught as:

```text
input -> output
```

But search memory is:

```text
state plus assumptions -> reusable claim plus proof strength
```

The assumptions are part of the input. The proof strength is part of the
output.

## The Pattern Escapes the Board

The same pattern appears outside games.

A theorem prover records lemmas, not line numbers in one failed proof attempt.
A dynamic program records subproblems, not the route that happened to reach
them. A planner records states, not just action histories. A build system records
artifacts under dependency fingerprints, not under the command that most
recently asked for them.

The reusable unit is rarely "the path." It is the equivalence class of paths
that leave the future unchanged.

That equivalence class is a research object. Make it too fine, and the system
misses reuse. Make it too coarse, and the system reuses lies.

## Before You Trust the Memory

Before trusting a transposition table, I want answers to these questions:

- What exactly defines a state?
- Is the side to move, rule state, random seed, or hidden information included?
- Is the stored score exact, a lower bound, or an upper bound?
- How deep was the stored search?
- Can a shallow entry answer a deeper query, or only order moves?
- What replacement policy decides which entry survives a collision?
- Is the stored key wide enough for the risk budget?
- Are key collisions detected, or merely hoped away?
- Are table hits tested against a no-table search on small positions?

The philosophical version is shorter:

```text
remember positions, not stories;
remember claims, not just scores;
remember identity is engineered, not granted
```

The game tree remains a useful drawing. But the engine's memory should know the
drawing is incomplete.

[^shannon]: Claude E. Shannon, ["Programming a Computer for Playing Chess"](https://www.computerhistory.org/chess/doc-431614f453dde/), *Philosophical Magazine*, 1950. The Computer History Museum page provides a scanned PDF of the original paper.

[^knuth]: Donald E. Knuth and Ronald W. Moore, ["An Analysis of Alpha-Beta Pruning"](https://kodu.ut.ee/~ahto/eio/2011.07.11/ab.pdf), *Artificial Intelligence* 6(4), 293-326, 1975. DOI record: [10.1016/0004-3702(75)90019-3](https://doi.org/10.1016/0004-3702(75)90019-3).

[^zobrist]: Albert L. Zobrist, ["A New Hashing Method with Application for Game Playing"](https://research.cs.wisc.edu/techreports/1970/TR88.pdf), University of Wisconsin Technical Report 88, 1970. The paper was later reprinted in *ICCA Journal* 13(2), 69-73, 1990; the publisher page summarizes the method and retrieval-error check: [ICGA Journal](https://journals.sagepub.com/doi/10.3233/ICG-1990-13203).

[^breuker]: Dennis M. Breuker, Jos W. H. M. Uiterwijk, and H. Jaap van den Herik, ["Information in Transposition Tables"](https://www.researchgate.net/profile/Jos-Uiterwijk/publication/2755801_Information_in_Transposition_Tables/links/0912f511dfdc86d16e000000/Information-in-Transposition-Tables.pdf), 1996. The paper lists the traditional entry fields and experimentally separates the value of stored moves, scores, bound flags, and depth.
