---
layout: post
title: "The Prefix Sum Is an Address Machine"
description: "Parallel scan looks like a cumulative sum, but its real power is turning local facts into global addresses with logarithmic synchronization."
date: 2026-06-15 11:47:00 -0400
categories: computer-science
tags: [parallel-prefix, prefix-sum, scan, parallel-algorithms, gpu-computing, stream-compaction, data-parallelism]
excerpt: "A scan is what happens when every element asks: how many relevant things came before me? That one answer turns flags into addresses, serial loops into parallel schedules, and local decisions into packed data."
---

There is a small operation hiding inside a surprising amount of parallel
software:

```text
[3, 1, 7, 0, 4]  ->  [0, 3, 4, 11, 11]
```

At first it looks like a cumulative sum with an off-by-one convention. That is
not wrong, but it is too small a story.

The operation is an **exclusive scan**, also called a prefix sum or prescan.
For inputs $$x_0,\ldots,x_{n-1}$$ and associative operator $$\oplus$$ with
identity $$I$$, it returns

$$
[I,\ x_0,\ x_0 \oplus x_1,\ \ldots,\ x_0 \oplus \cdots \oplus x_{n-2}].
$$

Blelloch's classic survey calls this the all-prefix-sums operation and shows
why it is a primitive, not a trick.[^blelloch] The operator can be addition,
maximum, a matrix-like recurrence operator, or the carry operator in a binary
adder. The requirement is associativity. The order of operands still matters,
so commutativity is not required.

The version I keep reaching for is even plainer:

$$
a_i = \sum_{j < i} f_j,\quad f_j \in \{0,1\}.
$$

If $$f_i=1$$, then $$a_i$$ is the output address for item $$i$$ in a stable
compaction. Each row only knows whether it survives. Scan tells every survivor
where to go.

That is the magic: scan converts local predicates into global coordinates.

## The Address Factory

Imagine a GPU block, a vectorized database kernel, or a SIMD image pipeline.
Every lane can decide locally whether its record should be kept. But "write the
kept records contiguously" is not local. If I am a kept record at position 19, my
destination depends on how many earlier records survived.

A serial loop solves this with a counter:

```text
write = 0
for i in 0..n-1:
  if keep[i]:
    out[write] = x[i]
    write += 1
```

That counter is a dependency chain. Every iteration waits for the previous one.

Scan breaks the chain without changing the answer. Compute the keep flags, run
an exclusive scan over those flags, then let each kept item write to its scanned
address. The writes are independent because the addresses are unique.

This is the same move behind stream compaction, radix-sort split steps,
histogram offsets, sparse frontier construction, parser bookkeeping, line-of-
sight tests, and carry-lookahead addition.[^gpu-gems]

The loop was not "inherently serial." It was hiding a prefix problem.

## A Lab With Two Prefix Machines

The lab below builds a small flagged array, runs three scans, and uses the
exclusive scan of the flags to compact the kept items.

It compares:

- **Serial scan:** minimal arithmetic, but span grows linearly.
- **Hillis-Steele scan:** logarithmic span and lots of parallelism, but
  $$O(n \log n)$$ adds.[^hillis-steele]
- **Blelloch scan:** an up-sweep and down-sweep over a conceptual tree, with
  $$O(n)$$ adds and roughly twice the logarithmic span.[^blelloch]

Default audited facts for `n = 32`, density `47%`, seed `29`:

- kept rows: `15 / 32`;
- serial span: `31`;
- Hillis-Steele adds: `129`;
- Blelloch adds: `62`;
- audit grid: `288 / 288` parameter cases passed.

<style>
  .prefix-scan-lab {
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

  .prefix-scan-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  }

  .prefix-scan-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .prefix-scan-lab__controls input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
  }

  .prefix-scan-lab__metrics {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    margin: 1rem 0;
  }

  .prefix-scan-lab__metric {
    background: #f8fafc;
    border: 1px solid #dbe4ec;
    border-radius: 6px;
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
  }

  .prefix-scan-lab__metric span {
    color: #64707c;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .prefix-scan-lab__metric strong {
    color: #172026;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  .prefix-scan-lab canvas {
    border: 1px solid #d7dee5;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .prefix-scan-lab__legend,
  .prefix-scan-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .prefix-scan-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .prefix-scan-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    margin-right: 0.35rem;
    vertical-align: -0.06rem;
    width: 0.7rem;
  }

  .prefix-scan-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="prefix-scan-lab" data-prefix-scan-lab>
  <div class="prefix-scan-lab__controls">
    <label>
      Items <output data-value="logN">32</output>
      <input type="range" data-param="logN" min="3" max="6" step="1" value="5">
    </label>
    <label>
      Keep density <output data-value="density">47%</output>
      <input type="range" data-param="density" min="5" max="95" step="1" value="47">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="29">
    </label>
  </div>
  <div class="prefix-scan-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="780" aria-label="Prefix scan lab comparing serial, Hillis-Steele, and Blelloch scans for stream compaction"></canvas>
  <div class="prefix-scan-lab__legend">
    <span><i style="background:#0f766e"></i> kept item</span>
    <span><i style="background:#7c3aed"></i> exclusive address</span>
    <span><i style="background:#be123c"></i> Hillis-Steele schedule</span>
    <span><i style="background:#2563eb"></i> Blelloch schedule</span>
    <span><i style="background:#d97706"></i> compacted output</span>
  </div>
  <p class="prefix-scan-lab__note">
    Deterministic integer experiment. The audit checks serial, Hillis-Steele,
    and Blelloch scans against each other, verifies the work formulas, and
    confirms stable compaction across 288 parameter settings.
  </p>
</div>
<script defer src="{{ '/assets/js/prefix-scan-lab.js?v=20260615a' | relative_url }}"></script>

Move **Items** upward. Hillis-Steele keeps span low, but its add count grows
faster. Blelloch spends two tree traversals and stays work-efficient.

Move **Keep density**. The compacted output changes, but the scan schedules do
not. This is why scan is a primitive: the coordination cost mostly depends on
the shape of the array, not on how many lanes happen to survive.

## Work Is Not Span

The important distinction is not "parallel is faster." The important distinction
is that parallel algorithms have at least two budgets.

**Work** is the total amount of arithmetic. If you had to run the algorithm on
one processor, work is the bill.

**Span** is the length of the dependency chain. With enough processors and
cheap synchronization, span is the part you cannot parallelize away.

For power-of-two $$n$$:

$$
\begin{aligned}
\text{serial work} &= n - 1, & \text{serial span} &= n - 1, \\
\text{Hillis-Steele work} &= n\log_2 n - (n - 1), & \text{span} &= \log_2 n, \\
\text{Blelloch work} &= 2(n - 1), & \text{span} &= 2\log_2 n.
\end{aligned}
$$

Hillis-Steele is impatient. At stride 1, every element looks one step left. At
stride 2, it looks two steps left. Then four, eight, and so on. After
$$\log_2 n$$ rounds, every element has accumulated everything to its left.

That impatience costs arithmetic. Many partial sums are recomputed at different
destinations.

Blelloch is more frugal. The up-sweep builds partial sums into a tree. The
down-sweep pushes the sums of left siblings into the right places. It takes more
rounds than Hillis-Steele, but it does only linear work. GPU Gems presents this
as the step from a straightforward parallel scan to a work-efficient one, before
the hardware-specific fight with shared-memory bank conflicts begins.[^gpu-gems]

Ladner and Fischer showed that this is a family of tradeoffs, not a single
algorithmic personality.[^ladner-fischer] Prefix circuits can buy smaller depth
with more nodes, or save nodes with more depth. The lab only shows two famous
corners of that design space.

## The Associativity Clause

Scan is not allowed to reorder arbitrarily. It is allowed to reparent.

That sounds pedantic until floating point shows up. Integer addition of small
values is associative for this lab, so all three scans agree exactly. Floating
point addition is not associative in real machines. A parallel scan over floats
can be mathematically faithful to a parenthesized expression and still differ
from a serial left fold.

This is not a bug in scan. It is the contract becoming visible.

If the operator is associative, scan exposes parallelism in a prefix
computation. If the operator is only approximately associative, the algorithm is
also choosing a numerical policy. Production libraries need to decide whether
speed, reproducibility, error bounds, or compatibility with a serial reference
is the governing promise.

The same issue appears in reductions, but scan makes it harder to hide because
it returns every intermediate prefix, not just the final total.

## The Shape to Notice

Once you see scan as an address machine, a lot of parallel code gets simpler.

Filtering is not "append from many lanes"; it is flags, scan, scatter.

Radix sort is not "sort the whole key"; it is repeated partitioning where each
bit gets a destination range.

Graph traversal is not "many threads push into one queue"; it is each frontier
edge deciding whether it emits work, then using a prefix count to reserve space.

Even a binary adder is not just rippling carries from right to left. It can be a
prefix computation over generate/propagate pairs. The long dependency chain is
real, but it is not inevitable.

The scan asks every element one question:

> How much relevant history is before me?

The answer is a coordinate. Once every lane has a coordinate, the machine can
stop arguing over a shared counter and start writing in parallel.

That is why a prefix sum is more than a cumulative sum.

It is a scheduler for ordered data.

[^blelloch]: Guy E. Blelloch, ["Prefix Sums and Their Applications"](https://www.cs.cmu.edu/~guyb/papers/Ble93.pdf), CMU-CS-90-190, 1990.

[^hillis-steele]: W. Daniel Hillis and Guy L. Steele Jr., ["Data Parallel Algorithms"](https://rsim.cs.illinois.edu/arch/qual_papers/systems/3.pdf), *Communications of the ACM*, 1986. [ACM record](https://doi.org/10.1145/7902.7903).

[^ladner-fischer]: Richard E. Ladner and Michael J. Fischer, ["Parallel Prefix Computation"](https://dl.acm.org/doi/10.1145/322217.322232), *Journal of the ACM*, 1980.

[^gpu-gems]: Mark Harris, Shubhabrata Sengupta, and John D. Owens, ["Parallel Prefix Sum (Scan) with CUDA"](https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-39-parallel-prefix-sum-scan-cuda), *GPU Gems 3*, 2007.
