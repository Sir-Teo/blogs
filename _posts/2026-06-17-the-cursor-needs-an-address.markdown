---
layout: post
title: "The Cursor Needs an Address"
description: "Collaborative text editing is not just merging strings. Every inserted character needs a stable identity, and the wrong address scheme can make two sensible edits interleave into nonsense."
date: 2026-06-17 04:51:00 -0400
categories: distributed-systems
series: trustworthy-experiments
tags: [crdt, collaborative-editing, local-first, distributed-systems, sequence-crdt, rga, logoot, software-engineering]
excerpt: "A cursor offset is a local fact. A collaborative editor needs an address that survives delay, offline work, deletion, and another person typing at the same place."
---

A text cursor is not a location in the distributed-systems sense.

On your machine, "insert after character 6" is perfectly meaningful. Across two
offline replicas, it is a rumor. By the time the operation arrives elsewhere,
character 6 may have moved, split, disappeared, or become surrounded by someone
else's work.

Collaborative text editing therefore has to answer a stranger question:

```text
what is the durable address between these two characters?
```

That address has to survive network delay. It has to be generated locally, before
asking a server for permission. It has to make independently edited copies
converge. And it has to produce text that a human can still read.

Those are different requirements. Convergence says every replica ends in the
same state. It does not say the state is a good merge.

## Dense Positions Feel Natural

One family of sequence CRDTs gives every inserted character an identifier drawn
from a dense ordered space. If two visible characters have positions `0.49` and
`0.64`, an inserted character can take something in between. The document order
is then just identifier order.

That is the Logoot/LSEQ flavor of solution.[^logoot][^lseq] The cursor becomes
an interval. Inserting text means manufacturing new addresses inside that
interval. Since replicas use the same total order, shuffled network delivery can
still converge.

The catch is that "between" is not free. If users keep inserting near the same
boundary, identifiers need more digits. If two users concurrently type passages
at the same place, a naive allocation strategy can give both passages matching
address ladders. A deterministic tie-breaker then does exactly what it was asked
to do: sort the characters by address.

The result can be character-level interleaving.

## Convergence Is Too Weak

Kleppmann, Gomes, Mulligan, and Beresford made this failure mode explicit in
their work on interleaving anomalies.[^interleaving] Two users concurrently
insert readable passages at the same cursor. A convergent algorithm may merge
them into a single unreadable braid.

This is not a mere aesthetic complaint. A collaborative editor is not a set. The
relative order of characters carries user intent. If Alice typed a phrase, most
of the time the merged document should preserve that phrase as a phrase, even if
Bob typed another phrase at the same place.

The specification work by Attiya, Burckhardt, Gotsman, Morrison, Yang, and
Zawirski is useful here because it separates the abstract list behavior from the
implementation trick.[^spec] It also shows why metadata is not accidental. For a
large class of list protocols, correctness forces metadata overhead that grows
at least linearly with the number of deleted elements. Tombstones and causal
addresses are not ugly leftovers. They are evidence.

## Lab: Two People Type At The Same Cursor

The lab below stages a deliberately small race. Several replicas type short
phrases at the same initial cursor while offline. Then their operations arrive in
a shuffled order.

It compares two simplified merge disciplines:

**Fractional position IDs.** Each local keystroke allocates an ordered address
between the previous local character and the right boundary. The final document
is sorted by `(address, replica, local sequence)`. This is a toy stand-in for the
position-identifier family, not an implementation of Logoot or LSEQ.

**Left-origin list.** Each inserted character stores the character it followed at
creation time. The final document is a deterministic traversal of that
left-origin forest. This is an RGA-style toy: good enough to expose the
causality shape, not a production editor.

<style>
  .sequence-crdt-lab {
    --seq-text: #0f172a;
    --seq-muted: #64748b;
    --seq-border: #dbe3ea;
    --seq-bg: #f8fafc;
    --seq-good: #0f766e;
    --seq-warn: #b45309;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid var(--seq-border);
    border-radius: 8px;
    color: var(--seq-text);
    margin: 1.5rem 0;
    padding: 1rem;
  }

  .sequence-crdt-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .sequence-crdt-lab label {
    color: #334155;
    display: grid;
    font-size: 0.82rem;
    font-weight: 750;
    gap: 0.35rem;
    min-width: 0;
  }

  .sequence-crdt-lab output {
    color: var(--seq-text);
    display: block;
    font-size: 0.95rem;
    font-weight: 850;
    min-height: 1.2em;
  }

  .sequence-crdt-lab input,
  .sequence-crdt-lab select {
    accent-color: #2563eb;
    min-width: 0;
    width: 100%;
  }

  .sequence-crdt-lab input[type="range"] {
    margin-top: 0.25rem;
  }

  .sequence-crdt-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: var(--seq-text);
    font: inherit;
    min-height: 2.2rem;
    padding: 0.35rem 0.5rem;
  }

  .sequence-crdt-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 1rem 0;
  }

  .sequence-crdt-lab__metric {
    background: rgba(248, 250, 252, 0.88);
    border: 1px solid var(--seq-border);
    border-radius: 7px;
    min-height: 4rem;
    padding: 0.65rem 0.7rem;
  }

  .sequence-crdt-lab__metric--good {
    border-left: 3px solid var(--seq-good);
  }

  .sequence-crdt-lab__metric--warn {
    border-left: 3px solid var(--seq-warn);
  }

  .sequence-crdt-lab__metric span {
    color: var(--seq-muted);
    display: block;
    font-size: 0.64rem;
    font-weight: 750;
    letter-spacing: 0.03em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .sequence-crdt-lab__metric strong {
    display: block;
    font-size: clamp(1rem, 2.2vw, 1.35rem);
    line-height: 1.15;
    margin-top: 0.35rem;
  }

  .sequence-crdt-lab canvas {
    display: block;
    height: 850px;
    max-width: 100%;
    width: 100%;
  }

  .sequence-crdt-lab__legend {
    color: var(--seq-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-top: 0.8rem;
  }

  .sequence-crdt-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .sequence-crdt-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .sequence-crdt-lab__note {
    color: var(--seq-muted);
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }

  @media (max-width: 760px) {
    .sequence-crdt-lab {
      padding: 0.85rem;
    }

    .sequence-crdt-lab__controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sequence-crdt-lab__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sequence-crdt-lab canvas {
      height: 1030px;
    }
  }
</style>

<div class="sequence-crdt-lab" data-sequence-crdt-lab>
  <div class="sequence-crdt-lab__controls">
    <label>
      Writers <output data-value="actors">2</output>
      <input type="range" min="2" max="4" step="1" value="2" data-param="actors">
    </label>
    <label>
      Letters per writer <output data-value="letters">7</output>
      <input type="range" min="3" max="10" step="1" value="7" data-param="letters">
    </label>
    <label>
      Address allocator <output data-value="allocator">tail-biased</output>
      <select data-param="allocator">
        <option value="tail" selected>tail-biased</option>
        <option value="balanced">balanced</option>
        <option value="left">left-biased</option>
      </select>
    </label>
    <label>
      Delivery seed <output data-value="seed">19</output>
      <input type="range" min="1" max="9999" step="1" value="19" data-param="seed">
    </label>
  </div>

  <div class="sequence-crdt-lab__metrics" data-role="metrics"></div>

  <canvas data-role="canvas" aria-label="Sequence CRDT lab comparing fractional position identifiers with an RGA-style left-origin list"></canvas>

  <div class="sequence-crdt-lab__legend">
    <span><i style="background:#0f766e"></i>Alice</span>
    <span><i style="background:#7c3aed"></i>Bob</span>
    <span><i style="background:#d97706"></i>Chandra</span>
    <span><i style="background:#be123c"></i>Dana</span>
  </div>
  <p class="sequence-crdt-lab__note" data-role="note"></p>
</div>

<script src="{{ '/assets/js/sequence-crdt-lab.js?v=20260617a' | relative_url }}"></script>

With the default settings, the position-ID row reads something like a braid:
Alice's first letter, Bob's first letter, Alice's second letter, Bob's second
letter, and so on. The addresses are doing their job. They converge. They are
also preserving the wrong local structure.

The left-origin row does a different kind of bookkeeping. Alice's second
character says "I came after Alice's first character." Bob's second character
says the same about Bob's first. When both first characters are concurrent
children of the same old cursor, a deterministic tie-breaker chooses which run
comes first. But once a run starts, its descendants stay attached.

The cost shows up in the audit. Some shuffled deliveries are causally early:
`A:4` may arrive before `A:3`. The toy left-origin engine buffers those messages
until their parent is present. Real systems hide that machinery behind causal
delivery, operation buffers, sync protocols, tombstones, or compacted history.

## The Address Is A Claim About Intent

There is no universally correct merge of concurrent prose. If Alice writes
`blue` and Bob writes `green` at the same place, maybe the right document is
`bluegreen`. Maybe it is `greenblue`. Maybe it should expose a conflict. But it
is rarely `bglrueeen`.

This is why newer work talks about non-interleaving as a correctness property,
not just a UI preference. Weidner and Kleppmann's Fugue work defines maximal
non-interleaving and gives CRDT algorithms designed around it.[^fugue] The
interesting part is not that a clever tie-breaker exists. It is that the
correctness property had to name a human-visible failure mode that ordinary
strong eventual consistency did not rule out.

There is a second pressure: storage. Text editing histories are full of deletes,
undoes, replaced paragraphs, and formatting moves. If the algorithm needs old
positions to interpret future operations, deleting visible text does not
necessarily delete its role in the address system. Attiya and coauthors' lower
bound is the hard version of that lesson: in broad peer-to-peer list protocols,
some metadata growth is inherent.[^spec]

So a collaborative editor has three ledgers, not one:

1. the visible document,
2. the causal evidence needed to merge future operations,
3. the human intent properties the merge is supposed to preserve.

Optimizing only the first ledger is how a text editor becomes a sorting
algorithm.

## Why This Still Feels Current

Local-first software made this problem feel fresh again. If the user should be
able to work offline, own their files, sync peer-to-peer, and later merge
without asking a central server to serialize every keystroke, the document
format itself has to carry enough history.

That does not mean old sequence CRDTs are the final answer. Eg-walker, by Joseph
Gentle and Martin Kleppmann, is a recent hybrid direction: keep editing events
in a compact form, walk the event graph when merging, and aim for much lower
steady-state memory and load time than conventional CRDT storage while retaining
peer-to-peer applicability.[^egwalker]

The design space is not "OT versus CRDT" as team jerseys. It is:

```text
what history is stored, when is it replayed, and which merge anomalies are ruled out?
```

The tiny lab above is deliberately unfair to production algorithms. It uses a
pathological same-cursor race and a simple address allocator. But that unfairness
is useful. It isolates the thing a good editor must prevent.

A cursor offset is where your hand is.

A collaborative text address is what your future replicas can still prove.

[^logoot]: Stephane Weiss, Pascal Urso, and Pascal Molli, "Logoot: A Scalable Optimistic Replication Algorithm for Collaborative Editing on P2P Networks", ICDCS 2009. DOI: [10.1109/ICDCS.2009.75](https://doi.org/10.1109/ICDCS.2009.75). The CRDT paper index lists it under text-editing sequence CRDTs: [crdt.tech papers](https://crdt.tech/papers.html).

[^lseq]: Brice Nedelec, Pascal Molli, Achour Mostefaoui, and Emmanuel Desmontils, "LSEQ: an Adaptive Structure for Sequences in Distributed Collaborative Editing", DocEng 2013. [ACM DOI](https://doi.org/10.1145/2494266.2494278). A public slide/PDF version summarizes the allocation strategy and identifier-size experiments: [ConcoRDanT PDF](https://concordant.lip6.fr/uploads/ConcoRDanT/LSEQ-%20an%20Adaptive%20Structure%20for%20Sequences%20in%20Distributed%20Collaborative%20Editing.pdf).

[^interleaving]: Martin Kleppmann, Victor B. F. Gomes, Dominic P. Mulligan, and Alastair R. Beresford, "Interleaving anomalies in collaborative text editors", PaPoC 2019. [PDF](https://martin.kleppmann.com/papers/interleaving-papoc19.pdf), [ACM DOI](https://doi.org/10.1145/3301419.3323972).

[^spec]: Hagit Attiya, Sebastian Burckhardt, Alexey Gotsman, Adam Morrison, Hongseok Yang, and Marek Zawirski, "Specification and space complexity of collaborative text editing", *Theoretical Computer Science* 855:141-160, 2021; earlier PODC 2016 version. [Microsoft Research](https://www.microsoft.com/en-us/research/publication/specification-and-space-complexity-of-collaborative-text-editing/), [PDF](https://software.imdea.org/~gotsman/papers/editing-podc16.pdf).

[^fugue]: Matthew Weidner and Martin Kleppmann, "The Art of the Fugue: Minimizing Interleaving in Collaborative Text Editing", submitted 2023, revised 2025, IEEE Transactions on Parallel and Distributed Systems 36(11):2425-2437. [arXiv](https://arxiv.org/abs/2305.00583), [DOI](https://doi.org/10.1109/TPDS.2025.3611880).

[^egwalker]: Joseph Gentle and Martin Kleppmann, "Collaborative Text Editing with Eg-walker: Better, Faster, Smaller", accepted at EuroSys 2025. [arXiv](https://arxiv.org/abs/2409.14252), [ACM DOI](https://doi.org/10.1145/3689031.3696076), [artifact repository](https://github.com/josephg/egwalker-paper).
