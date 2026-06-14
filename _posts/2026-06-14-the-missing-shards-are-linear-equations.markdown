---
layout: post
title: "The Missing Shards Are Equations"
description: "Reed-Solomon erasure coding is not backup magic. It is the promise that any k honest surviving shards contain enough GF(256) equations to rebuild the stripe."
date: 2026-06-14 11:18:00 -0400
categories: data-systems
tags: [reed-solomon, erasure-coding, finite-fields, storage-systems, distributed-storage, coding-theory]
excerpt: "A failed disk is easier than a lying disk: erasures name the holes, so recovery is matrix inversion instead of detective work."
---

The nicest failure in a storage system is the one that leaves a note.

A disk vanishes. A host stops answering. An object shard times out. The system
knows which piece failed to arrive. Annoying, yes. Mysterious, no.

That distinction is where Reed-Solomon coding gets its leverage. If the holes
are named, the decoder does not have to play detective. It only needs enough
surviving equations to fill them.

The bargain is small enough to fit on a label stuck to a drive tray:

```text
split the file into k data shards
compute m parity shards
store n = k + m shards
recover from any m missing shards
```

The dangerous word is "any."

## A Missing Disk Is Polite

The Hamming-code story is about an unknown bit flip. Something arrived, but one
position may be wrong. The decoder has to locate the bad coordinate and repair
it.

The storage story is often kinder. A disk, host, rack, or object shard is
missing. The system can point at the empty chair.

Reed and Solomon's 1960 paper described polynomial codes over finite fields:
take a message as coefficients of a polynomial, evaluate it at many field
points, and use the redundancy to recover from corruption or loss.[^reed] In
the erasure-only case, the idea can be said in one line:

```text
a degree k-1 polynomial is determined by any k points
```

In modern storage, the "points" are byte columns in shards. Each byte is an
element of a finite field such as GF(256). Addition is XOR. Multiplication is
table-driven arithmetic modulo an irreducible polynomial. The code in the lab
uses the common GF(256) polynomial `0x11d`.

This is not ordinary integer arithmetic. It is arithmetic where every nonzero
byte has an inverse. That inverse is what lets recovery be matrix inversion
instead of a special case for every failure pattern.

## Keep the Data, Add the Equations

The polynomial picture is elegant but not always how you want to store data.
If every shard is an evaluation, even reading an intact file requires decoding.
Storage systems usually prefer **systematic** codes:

```text
D0 D1 D2 ... D(k-1) are the original data shards
P0 P1 ... P(m-1) are parity shards
```

The lab constructs this form directly.

First, build a Vandermonde matrix over GF(256):

$$
V_{i,j} = x_i^j.
$$

Any $$k$$ rows are invertible when the $$x_i$$ are distinct, which is the
Reed-Solomon maximum-distance-separable property in matrix clothing. Then
multiply every row by the inverse of the first $$k$$ rows. The top block becomes
identity, so the first $$k$$ encoded shards are the original data shards. The
MDS property survives because multiplying by an invertible matrix does not
change row independence.

That gives a generator matrix:

$$
G =
\begin{bmatrix}
I \\
P
\end{bmatrix}.
$$

Encoding a stripe is:

$$
\text{shards} = G \cdot \text{data}.
$$

Decoding after erasures is:

1. choose any $$k$$ surviving shard rows;
2. invert that $$k \times k$$ submatrix of $$G$$;
3. multiply the surviving shard bytes by that inverse;
4. get the original data shards back.

Plank and Ding's correction note to the classic Reed-Solomon RAID tutorial says
the desired storage matrix has identity in the first data rows and remains
invertible after deleting any parity-count rows; it derives such a matrix from a
Vandermonde matrix by elementary operations.[^plank] That is exactly the shape
this lab uses.

## Break the Stripe on Purpose

The lab below is not a cartoon of Reed-Solomon. It performs the GF(256) work:
encode a small deterministic byte payload, erase selected shards, reconstruct
from surviving rows when enough rows remain, and check a recovered-payload
checksum.

It also draws a deliberately simple reliability curve. The curve assumes
independent shard losses at probability $$p$$. Real storage failures are not
that clean: racks fail together, repairs take time, latent sector errors exist,
operators make correlated mistakes, and placement policy matters. Treat the
curve as a calculator for the combinatorics, not as a datacenter availability
model.

<style>
  .rs-erasure-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rs-erasure-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(164px, 1fr));
  }

  .rs-erasure-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rs-erasure-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .rs-erasure-lab select,
  .rs-erasure-lab input[type="range"] {
    width: 100%;
  }

  .rs-erasure-lab select {
    background: #f8fafc;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    min-height: 2.2rem;
    padding: 0.25rem 0.45rem;
  }

  .rs-erasure-lab__metrics {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 1rem 0;
  }

  .rs-erasure-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }

  .rs-erasure-lab__metric span {
    color: #5d6872;
    display: block;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 720;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .rs-erasure-lab__metric strong {
    color: #172026;
    display: block;
    font-family: var(--font-ui);
    font-size: 1.03rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    margin-top: 0.15rem;
  }

  .rs-erasure-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    max-width: 100%;
    width: 100%;
  }

  .rs-erasure-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    gap: 0.7rem 1rem;
    margin-top: 0.75rem;
  }

  .rs-erasure-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rs-erasure-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .rs-erasure-lab__note {
    color: #5d6872;
    font-size: 0.86rem;
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }
</style>

<div class="rs-erasure-lab" data-reed-solomon-erasure-lab>
  <div class="rs-erasure-lab__controls">
    <label>
      Data shards <output data-value="data">5</output>
      <input type="range" min="3" max="8" step="1" value="5" data-param="data">
    </label>
    <label>
      Parity shards <output data-value="parity">3</output>
      <input type="range" min="1" max="5" step="1" value="3" data-param="parity">
    </label>
    <label>
      Erased shards <output data-value="erasures">3</output>
      <input type="range" min="0" max="13" step="1" value="3" data-param="erasures">
    </label>
    <label>
      Erasure pattern
      <select data-param="pattern">
        <option value="cluster" selected>cluster</option>
        <option value="random">random</option>
        <option value="data">data first</option>
        <option value="parity">parity first</option>
      </select>
    </label>
    <label>
      Shard loss p <output data-value="failure">6%</output>
      <input type="range" min="1" max="30" step="1" value="6" data-param="failure">
    </label>
    <label>
      Seed <output data-value="seed">3</output>
      <input type="range" min="1" max="999" step="1" value="3" data-param="seed">
    </label>
  </div>
  <div class="rs-erasure-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Reed Solomon erasure coding lab showing shards, generator matrix, recovery equation, and stripe loss probability"></canvas>
  <div class="rs-erasure-lab__legend">
    <span><i style="background:#2563eb"></i> Data shard</span>
    <span><i style="background:#0f766e"></i> Parity shard</span>
    <span><i style="background:#be123c"></i> Missing</span>
    <span><i style="background:#d97706"></i> Recovered or selected</span>
  </div>
  <p class="rs-erasure-lab__note">
    The encoder is systematic Reed-Solomon over GF(256). The reliability curve
    assumes independent shard losses and does not model repair time, placement,
    correlated rack failures, checksums, or silent corruption.
  </p>
</div>

<script defer src="{{ '/assets/js/reed-solomon-erasure-lab.js?v=20260614a' | relative_url }}"></script>

The default run is a `5+3` stripe: five data shards, three parity shards,
`1.60x` storage overhead. The cluster pattern erases `D3`, `D4`, and `P0`. The
decoder chooses `D0`, `D1`, `D2`, `P1`, and `P2`, inverts those rows, and
rebuilds the original payload checksum exactly.

At the toy independent shard-loss probability `p = 6%`, the lab reports:

```text
raw five-shard file loss:  26.61%
5+3 RS stripe loss:        0.0746%
```

Those are not operational availability claims. They are the binomial shape of
the promise: a raw striped file dies if any required shard dies; a `5+3`
erasure-coded stripe dies only if four or more of the eight shards are missing
before repair.

Push **Erased shards** from `3` to `4`. The decoder refuses to recover. That is
not a bug. With only four surviving shards and five unknown data shards, there
are not enough independent equations.

Push **Parity shards** to `5`. The storage overhead rises to `2.00x`, while
the displayed independent-loss probability drops again because the stripe can
tolerate five missing shards. Redundancy is a knob, not a blessing.

Change **Erasure pattern** to `parity first`. Losing only parity is boring:
reads of the current file can still use the data shards. It matters for future
fault tolerance because the stripe is now living without its buffer.

## What Any k Really Promises

The lab's recovery path is intentionally blunt. It does not use a specialized
decoder. It does this:

```text
take k surviving generator rows
invert the k by k matrix over GF(256)
multiply the surviving shards by that inverse
```

The invariant sweep I ran for the lab checked every allowed subset for data
shard counts `3..8` and parity counts `1..5`: `4,915` generator submatrices were
invertible. Across the four erasure-pattern modes, it also ran `480` exact
recoveries and `660` over-budget erasure cases that correctly failed.

That is the point of an MDS code. With $$n=k+m$$, the minimum distance is
$$m+1$$. For erasures, known missing locations, it can tolerate $$m$$ missing
symbols. It cannot tolerate $$m+1$$ missing symbols without additional
information, because fewer than $$k$$ equations remain.

The algebra is sharp. The operational system around it is not.

## The Datacenter Is Not a Coin Flipper

Rabin's Information Dispersal Algorithm framed the storage version beautifully:
break a file of length $$L$$ into $$n$$ pieces, each of length $$L/m$$, so that
any $$m$$ pieces reconstruct the file; the total stored length is $$(n/m)L$$,
which can be close to the original file size.[^rabin]

That space efficiency is why erasure coding shows up in cold and warm storage.
Facebook's f4 warm BLOB store, for example, used Reed-Solomon `10+4` coding
within a datacenter, placed blocks across racks, and reported large storage
savings relative to replication.[^f4]

But the production problem is larger than "can I invert the matrix?"

Placement decides whether a rack failure looks like one erasure or many.
Repair speed decides how long the stripe remains vulnerable after the first
loss. Checksums and scrubbing decide whether a supposed survivor is actually
trustworthy. Network topology decides how expensive reconstruction is. Hot
objects may prefer replication because reads are cheap and repairs are simple.
Cold objects may prefer erasure coding because bytes at rest dominate.

This is why the lab keeps the algebra in one hand and the reliability story in
the other. The algebra says:

```text
any k good shards determine the stripe
```

The system has to make "good" and "any" credible.

## Do Not Let a Bad Shard Pretend

One last warning matters.

An erasure decoder assumes the missing locations are known. If a shard is
present but wrong, the simple erasure decoder may confidently solve the wrong
system. Reed-Solomon codes can also be used for unknown errors, but the budget
changes: unknown errors cost roughly twice as much as named erasures.

Storage systems usually handle this by making silent corruption visible before
erasure decoding: checksums, authenticated hashes, scrubbing, versioning, and
end-to-end verification. A shard should either be trusted as an equation or
declared missing.

The clean mental model is:

```text
erasure coding is not backup
parity is not a checksum
reconstruction is not validation
```

Reed-Solomon is the algebraic core. It tells you how to recover when enough
honest pieces remain. The storage system around it exists to make that sentence
true when the day is loud, partial, and already going sideways.

[^reed]: I. S. Reed and G. Solomon, ["Polynomial Codes Over Certain Finite Fields"](https://sites.math.rutgers.edu/~zeilberg/akherim/ReedS1960.pdf), *Journal of the Society for Industrial and Applied Mathematics*, 1960. DOI record: [SIAM](https://epubs.siam.org/doi/10.1137/0108018).

[^plank]: James S. Plank, ["A Tutorial on Reed-Solomon Coding for Fault-Tolerance in RAID-like Systems"](https://web.eecs.utk.edu/~jplank/plank/papers/CS-96-332.pdf), Technical Report CS-96-332, 1996/1997; James S. Plank and Ying Ding, ["Note: Correction to the 1997 Tutorial on Reed-Solomon Coding"](https://web.eecs.utk.edu/~jplank/plank/papers/CS-03-504.pdf), UT-CS-03-504, 2003.

[^rabin]: Michael O. Rabin, ["Efficient Dispersal of Information for Security, Load Balancing, and Fault Tolerance"](https://cris.huji.ac.il/en/publications/efficient-dispersal-of-information-for-security-load-balancing-an/), *Journal of the ACM*, 36(2), 1989. DOI: [10.1145/62044.62050](https://doi.org/10.1145/62044.62050).

[^f4]: Subramanian Muralidhar et al., ["f4: Facebook's Warm BLOB Storage System"](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-muralidhar.pdf), OSDI 2014.
