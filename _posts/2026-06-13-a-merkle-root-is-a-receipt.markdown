---
layout: post
title: "Bring the Receipt, Not the Whole Log"
description: "A Merkle proof does not say trust me. It says this exact item belongs to this exact committed root, and here are the sibling hashes to check."
date: 2026-06-13 21:48:00 -0400
categories: computer-science
tags: [merkle-trees, transparency-logs, certificate-transparency, cryptography, hashing, authenticated-data-structures, security]
excerpt: "Merkle trees let small clients audit huge logs with short receipts. Inclusion is only the first check; transparency also needs consistency and shared checkpoints."
---

Most receipts are small promises with a logo at the top.

The restaurant promises that this is what you bought. The bank promises that
this transaction was posted. The package tracker promises that the scan happened
at 3:14 p.m.

A Merkle receipt is colder and more useful:

```text
This exact item is inside the exact set committed by this exact root hash.
```

It does not ask you to download the whole set. It does not ask you to trust the
server's memory. It gives you a path of sibling hashes. If the path recomputes
the published root, the item is committed by that root. If one bit changes, the
path breaks.

That can sound like a small data-structure trick. It is not. It is the reason
systems like Certificate Transparency can ask the public internet to audit
millions or billions of entries without making every client store the whole
log.[^ct]

The trick is to separate three claims that people often blur together:

```text
inclusion:     this leaf is in this root
append-only:   this newer root extends that older root
non-equivocal: everyone is being shown the same root
```

A Merkle tree gives you sharp tools for all three, but it does not run the
social machinery by itself.

## The One Hash Everyone Argues About

A binary Merkle tree hashes leaves first, then hashes pairs of child hashes until
one root remains. Certificate Transparency specifies domain separation: leaves
and internal nodes are hashed differently, using different prefixes, so a leaf
cannot be confused with an internal subtree.[^rfc9162]

In pseudocode:

```text
leaf_hash(data)       = HASH(0x00 || data)
node_hash(left,right) = HASH(0x01 || left || right)
```

The root commits to the ordered list of leaves. Change one certificate, one
package digest, one model artifact, or one log entry, and the root changes.

Ralph Merkle's early public-key protocol work gave the core authentication-tree
idea: many values can be authenticated by one short public value plus a path of
hashes.[^merkle] Later tamper-evident logging systems refined the idea for
append-only histories. Crosby and Wallach describe logs where an untrusted
server can prove that an event is still present and that the current log is
consistent with an earlier view, using logarithmic-size proofs.[^crosby]

That word, "view", is important. The tree root is not the whole truth. It is a
checkpoint. Someone still has to remember which checkpoints were published.

## Receipt Desk

The lab below uses a toy 64-bit hash so the browser can redraw instantly. Do not
copy it for security. The structure mirrors real transparency logs: leaves have
one hash domain, internal nodes have another, the proof is a list of sibling
hashes, and the byte estimates use SHA-256-sized nodes.

<style>
  .merkle-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .merkle-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(178px, 1fr));
  }

  .merkle-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .merkle-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .merkle-lab__controls input,
  .merkle-lab__controls select {
    width: 100%;
  }

  .merkle-lab__controls input {
    accent-color: #2563eb;
  }

  .merkle-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
  }

  .merkle-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .merkle-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .merkle-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.35);
  }

  .merkle-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .merkle-lab__metric span,
  .merkle-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .merkle-lab__metric span {
    display: block;
  }

  .merkle-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .merkle-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .merkle-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div id="merkle-receipt-lab" class="merkle-lab" data-merkle-lab>
  <div class="merkle-lab__controls">
    <label>
      Entries: <output data-value="entryCount">32</output>
      <input type="range" min="4" max="128" step="4" value="32" data-param="entryCount">
    </label>
    <label>
      Receipt leaf: <output data-value="leafIndex">6</output>
      <input type="range" min="0" max="31" step="1" value="6" data-param="leafIndex">
    </label>
    <label>
      Old checkpoint size: <output data-value="oldSize">8</output>
      <input type="range" min="1" max="32" step="1" value="8" data-param="oldSize">
    </label>
    <label>
      Scenario
      <select data-param="attack">
        <option value="honest" selected>Honest receipt</option>
        <option value="tamper">Tamper with receipt leaf</option>
        <option value="rewrite">Rewrite old prefix</option>
        <option value="split">Split-view root</option>
      </select>
    </label>
  </div>
  <div class="merkle-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="620" aria-label="Merkle receipt simulator showing tree roots, inclusion path, append-only checks, and proof cost"></canvas>
  <p class="merkle-lab__note">
    The toy hash is for visualization only. Real transparency systems use
    collision-resistant hashes, signed checkpoints, monitors, and carefully
    specified inclusion and consistency proof algorithms.
  </p>
</div>
<script defer src="{{ '/assets/js/merkle-receipt-lab.js?v=20260613a' | relative_url }}"></script>

At 32 entries, the inclusion proof has 5 sibling hashes. With SHA-256-sized
nodes, that is 160 bytes of sibling hashes, plus framing and the leaf. The full
toy log is already much larger. At internet scale, the difference is the whole
point: an audit path grows with tree height, not linearly with the log.

Switch to **Tamper with receipt leaf**. The public root and proof path are still
honest, but the claimed leaf has been edited. Verification fails. This is the
simple promise Merkle trees are good at:

```text
You cannot swap the item while keeping the same receipt.
```

Switch to **Rewrite old prefix**. The presented tree can give a valid inclusion
path for its rewritten contents. Local inclusion is not enough. The old
checkpoint root no longer matches the prefix of the new tree, so the append-only
check fails.

Switch to **Split-view root** with the receipt leaf outside the old checkpoint.
The presented root can have a valid inclusion proof and still differ from the
public root. This is equivocation: two observers are being shown two histories.
The cure is not a cleverer local Merkle path. The cure is shared checkpoints,
gossip, monitors, witnesses, or some other mechanism that makes split views
collide in public.

## The Web PKI Version

Certificate Transparency exists because the web PKI has many certificate
authorities, and a bad or compromised authority can issue a certificate that a
browser might otherwise accept. CT does not prevent every bad certificate from
being issued. It changes the environment: certificates are publicly logged in
append-only Merkle trees so domain owners, monitors, auditors, and clients can
notice suspicious issuance.[^cthow]

The objects have names:

```text
SCT: a log's promise to include a certificate soon
STH: a signed tree head, containing tree size and root hash
inclusion proof: path from a leaf to an STH root
consistency proof: evidence that a newer STH extends an older STH
```

RFC 9162 defines the Merkle Tree Hash recursively and specifies both inclusion
and consistency proof objects. It also notes that leaf and node hashes are
different domains because otherwise the tree is vulnerable to structural
confusion.[^rfc9162]

There is a lovely engineering humility here. The log operator is not assumed to
be angelic. The data structure is designed so the operator can answer audits
cheaply, and so contradictory answers leave cryptographic evidence.

## When the Directory Lies

The same pattern appears in end-to-end encrypted messaging. A messaging service
often maintains a directory from users to public keys. If the service silently
serves Alice a fake key for Bob, Alice can encrypt to the attacker while the UI
still looks normal.

Key transparency systems ask the service to publish an auditable directory.
CONIKS, for example, adapts transparency ideas to end-user key bindings and is
designed so users can efficiently monitor their own bindings while the system
preserves privacy about the directory's contents.[^coniks]

The Merkle root is not magic dust. It is a commitment point in a protocol:

1. Users check that their own records are present and correct.
2. Monitors or clients check that roots evolve consistently.
3. Participants compare checkpoints enough to make equivocation risky.

Without the third piece, a malicious server can show each user a locally
consistent little world.

## What the Receipt Does Not Buy

Merkle proofs are easy to oversell.

They do not prove that the leaf is true. A logged certificate can still be
misissued. A logged package can still be malicious. A logged model weight file
can still be a bad model.

They prove commitment:

```text
this exact byte string was included in this exact committed set
```

That is still powerful. It turns disputes about mutable server state into
disputes about signed checkpoints and short proofs. It lets small clients audit
large systems. It makes deletion, substitution, and equivocation harder to hide.

The engineering checklist is:

1. What exactly is the leaf? Bytes, normalized JSON, certificate DER, package
   hash, model artifact digest?
2. Is the tree ordered, and does the order matter?
3. Are leaf and node hashes domain-separated?
4. Who signs or otherwise anchors the root?
5. How does a client get an inclusion proof?
6. How does it check append-only evolution from old roots to new roots?
7. How do different clients learn whether they saw different roots?
8. What does the system do after detecting a bad proof?

A Merkle root is a receipt.

Transparency is the social and operational machinery that makes everyone bring
their receipts to the same table.

[^merkle]: Ralph C. Merkle, ["Protocols for Public Key Cryptosystems"](https://www.ralphmerkle.com/papers/Protocols.pdf), IEEE Symposium on Security and Privacy, 1980.

[^rfc9162]: Ben Laurie, Adam Langley, Emilia Kasper, Eran Messeri, and Rob Stradling, ["RFC 9162: Certificate Transparency Version 2.0"](https://www.rfc-editor.org/info/rfc9162/), IETF, 2021.

[^crosby]: Scott A. Crosby and Dan S. Wallach, ["Efficient Data Structures for Tamper-Evident Logging"](https://static.usenix.org/event/sec09/tech/full_papers/crosby.pdf), USENIX Security, 2009.

[^ct]: Ben Laurie, Adam Langley, and Emilia Kasper, ["RFC 6962: Certificate Transparency"](https://datatracker.ietf.org/doc/html/rfc6962), IETF, 2013.

[^cthow]: Certificate Transparency project, ["How CT Works"](https://certificate.transparency.dev/howctworks/).

[^coniks]: Marcela S. Melara, Aaron Blankstein, Joseph Bonneau, Edward W. Felten, and Michael J. Freedman, ["CONIKS: Bringing Key Transparency to End Users"](https://www.usenix.org/system/files/conference/usenixsecurity15/sec15-paper-melara.pdf), USENIX Security, 2015.
