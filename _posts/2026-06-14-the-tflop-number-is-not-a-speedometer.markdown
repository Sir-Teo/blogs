---
layout: post
title: "The TFLOP Number Is Not a Speedometer"
description: "A processor's peak FLOP rate is only one roof. The other roof is memory bandwidth, and the useful question is how much arithmetic each byte gets to buy."
date: 2026-06-14 19:38:03 -0400
categories: software-engineering
tags: [performance-engineering, roofline-model, memory-bandwidth, hpc, gpu-computing, numerical-computing]
excerpt: "Peak FLOPs answer how fast the math units could run. Roofline analysis asks whether the bytes arrive fast enough for that to matter."
---

The most misleading number on a fast chip is often the biggest one.

```text
60 TFLOP/s
989 TFLOP/s
1.9 PFLOP/s
```

The digits look like speed. They are not quite speed.

They are a ceiling for a particular kind of arithmetic under a particular
precision and instruction mix. To touch that ceiling, a kernel has to feed the
math units quickly enough. If every useful operation needs a new cache line from
memory, the arithmetic units spend most of their life waiting politely.

This is the small performance lie I want to unlearn:

```text
low percent of peak FLOPs means the code is bad at arithmetic
```

Sometimes the code is bad. Sometimes the code is asking memory to deliver a
miracle.

## The Missing Denominator

A kernel does work \(W\). It also moves data \(Q\).

The roofline model calls their ratio operational intensity:

$$
I = \frac{W}{Q}.
$$

If \(W\) is measured in floating-point operations and \(Q\) is measured in
bytes, then \(I\) has units:

```text
FLOPs per byte
```

That unit is the clue. It asks how much useful arithmetic each byte buys after
the byte has been fetched from the relevant memory level.

Williams, Waterman, and Patterson introduced the Roofline model as a visual
bound-and-bottleneck model that ties together floating-point performance,
operational intensity, and memory performance.[^roofline-osti] In their paper,
the central formula is:

$$
P_{\text{attainable}}
\le
\min(P_{\text{peak}},\ B_{\text{mem}} I).
$$

The horizontal roof is peak compute. The slanted roof is memory bandwidth times
operational intensity. The kernel lives under the lower of the two.

The intersection is the ridge point:

$$
I^* = \frac{P_{\text{peak}}}{B_{\text{mem}}}.
$$

If a kernel's intensity is left of the ridge, buying more peak FLOPs does little
unless bandwidth or reuse changes. If it is right of the ridge, arithmetic
throughput is the nearer ceiling.

The formula is simple enough to fit on a napkin.

It is also enough to explain a surprising amount of disappointment.

## A Triad Is Mostly Traffic

Take the STREAM triad shape:

```c
y[i] = a * x[i] + y[i]
```

Per element, in single precision, the useful arithmetic is roughly:

```text
multiply + add = 2 FLOPs
```

The traffic is roughly:

```text
read x[i]  = 4 bytes
read y[i]  = 4 bytes
write y[i] = 4 bytes
```

That gives:

$$
I_{\text{triad}}
=
\frac{2}{12}
\approx
0.167\ \text{FLOP/byte}.
$$

Now put that kernel on an illustrative accelerator with `60 TFLOP/s` of peak
FP32-like compute and `3.35 TB/s` of memory bandwidth. Those bandwidth and
compute scales are in the neighborhood of modern data-center GPUs; NVIDIA's
H100 page, for example, lists `67 teraFLOPS` FP32 and `3.35 TB/s` memory
bandwidth for H100 SXM, while tensor-core modes have much higher arithmetic
ceilings.[^h100]

The ridge for the `60 TFLOP/s`, `3.35 TB/s` machine is:

$$
I^* = \frac{60}{3.35} \approx 17.91\ \text{FLOP/byte}.
$$

The triad's `0.167 FLOP/byte` is not close. The memory roof predicts:

$$
3.35\ \text{TB/s}\times 0.167\ \text{FLOP/byte}
\approx
0.558\ \text{TFLOP/s}.
$$

That is less than one percent of `60 TFLOP/s`.

Not because the multiply-add is slow. Because each two-FLOP morsel arrives with
twelve bytes of billable traffic.

This is why STREAM exists. McCalpin's STREAM benchmark was designed to measure
sustained memory bandwidth for simple vector kernels, because user-code
bandwidth is often the figure of merit for low-computational-density vector
codes.[^mccalpin] A later LLNL summary describes STREAM as a synthetic benchmark
for sustainable memory bandwidth using Copy, Scale, Add, and Triad kernels.[^stream]

The word "sustainable" matters. Vendor peak bandwidth, pin bandwidth, cache
bandwidth, and application bandwidth are not the same promise. The original
Roofline paper is careful about this too: it uses sustainable DRAM bandwidth
behind the caches, not just the pin bandwidth of DRAM chips.[^roofline-pdf]

## Instrument Panel

The lab below is deterministic. It does not benchmark your browser. It computes
the roofline bound and plots several kernel shapes using simple byte ledgers:

- STREAM triad and dot product;
- a sparse-matrix-vector style access pattern;
- a stencil with adjustable neighbor reuse;
- tiled matrix multiply;
- an attention-score block with adjustable score-materialization traffic.

The default selected kernel is **STREAM triad**. Its point sits far left of the
ridge. Change **Selected kernel** to **tiled GEMM**, raise **Tile / block size**,
and watch the point move right as each loaded tile participates in more
multiply-adds.

<style>
  .roofline-lab {
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

  .roofline-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
  }

  .roofline-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .roofline-lab__controls input,
  .roofline-lab__controls select {
    accent-color: #0f766e;
    box-sizing: border-box;
    font: inherit;
    min-width: 0;
    width: 100%;
  }

  .roofline-lab__controls select {
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    padding: 0.42rem 0.5rem;
  }

  .roofline-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .roofline-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .roofline-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .roofline-lab__metric span,
  .roofline-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .roofline-lab__metric span {
    display: block;
  }

  .roofline-lab__metric strong {
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .roofline-lab canvas {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }

  .roofline-lab__note {
    margin: 0.9rem 0 0;
  }
</style>

<div class="roofline-lab" data-roofline-lab>
  <div class="roofline-lab__controls">
    <label>
      Selected kernel
      <select data-param="kernel">
        <option value="triad" selected>STREAM triad</option>
        <option value="dot">dot product</option>
        <option value="spmv">sparse matvec</option>
        <option value="stencil">7-point stencil</option>
        <option value="gemm">tiled GEMM</option>
        <option value="attention">attention block</option>
      </select>
    </label>
    <label>
      Peak compute: <output data-value="peak">60.0 TF/s</output>
      <input type="range" min="10" max="20000" step="10" value="600" data-param="peak">
    </label>
    <label>
      Memory bandwidth: <output data-value="bandwidth">3.35 TB/s</output>
      <input type="range" min="50" max="6000" step="50" value="3350" data-param="bandwidth">
    </label>
    <label>
      Element size: <output data-value="bytes">4 B</output>
      <input type="range" min="2" max="8" step="2" value="4" data-param="bytes">
    </label>
    <label>
      Tile / block size: <output data-value="tile">128</output>
      <input type="range" min="16" max="256" step="8" value="128" data-param="tile">
    </label>
    <label>
      Reuse / fusion: <output data-value="reuse">65%</output>
      <input type="range" min="0" max="100" step="5" value="65" data-param="reuse">
    </label>
  </div>
  <div class="roofline-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="Roofline model lab showing memory and compute ceilings, kernel operational intensity, and optimization directions"></canvas>
  <p class="roofline-lab__note">
    Bound model, not a benchmark. The byte ledgers are deliberately small enough
    to inspect; real kernels need measured traffic, cache effects, vectorization,
    occupancy, instruction mix, and launch overheads.
  </p>
</div>

<script src="{{ '/assets/js/roofline-lab.js?v=20260614a' | relative_url }}"></script>

## Two Ways to Move

On the roofline plot, there are only two honest directions.

You can move up by using more of the available compute ceiling:

```text
vectorize
use tensor cores
increase occupancy
reduce instruction overhead
```

Or you can move right by making each byte do more work:

```text
tile
fuse kernels
keep data in registers or shared memory
avoid materializing intermediates
compress or lower precision when numerically safe
```

The mistake is to apply the first list to a point that is trapped under the
memory roof.

For the default triad, doubling peak compute changes nothing. The lab's
**double peak** bar is still about `558 GF/s`, because the slanted roof has not
moved. Halving the bytes, however, doubles the roof to about `1.12 TF/s`.

For tiled GEMM at a large enough tile size, the story flips. Once the point
passes the ridge, lowering traffic is still useful for energy and pressure on
the memory system, but the roofline limit is now the flat compute roof. Better
instructions, better scheduling, and higher arithmetic utilization become the
natural questions.

This is why "optimize the kernel" is too vague to be an engineering plan.

The right verb depends on where the point is.

## The Modern GPU Twist

Modern accelerators make the ridge move dramatically depending on which
arithmetic roof you choose.

The same H100 product page lists `67 TFLOP/s` FP32, `989 TFLOP/s` TF32 Tensor
Core throughput with sparsity, and `3.35 TB/s` memory bandwidth for H100 SXM.
Those produce very different ridge points:

```text
FP32-ish roof:  67 / 3.35 ~= 20 FLOP/byte
TF32 tensor roof: 989 / 3.35 ~= 295 FLOP/byte
```

That does not mean tensor cores are pointless. It means the price of feeding
them is higher. A kernel that is compute-bound under the FP32 roof may become
memory-bound under the tensor-core roof unless it has enormous reuse.

This is one reason high-performance matrix multiply looks so unlike the
mathematical expression \(C=AB\). The implementation is an operation in data
reuse. Blocks are packed. Tiles live in shared memory or registers. Accumulators
stay hot. The same values are multiplied many times before being evicted.

The algorithm is not merely doing arithmetic.

It is manufacturing operational intensity.

## Percent of Peak Is Not a Diagnosis

Suppose a profile says:

```text
kernel achieves 0.6 TFLOP/s on a 60 TFLOP/s chip
```

That sounds like `1%` utilization.

But if the kernel has intensity `0.17 FLOP/byte` and the machine has `3.35 TB/s`
of sustainable bandwidth, then the roof is already around `0.56 TFLOP/s`. The
kernel may be close to its bandwidth-limited ceiling.

The diagnostic question is not:

```text
what percent of peak FLOPs did I get?
```

It is:

```text
what percent of the relevant roof did I get?
```

That roof might be DRAM bandwidth. Or L2 bandwidth. Or shared-memory bandwidth.
Or scalar instruction throughput. Or tensor-core throughput. Or PCIe. Or network
all-reduce. The simple roofline picture has two roofs because two roofs are
enough to teach the habit. Real performance work adds more ceilings.

The habit is the part that survives.

## How I Would Use This in a Code Review

Before touching a performance kernel, I want a byte ledger:

- how many useful operations are performed;
- how many bytes are read and written at the memory level that matters;
- whether the working set fits in cache;
- whether intermediates are materialized and reread;
- what precision is used for storage and arithmetic;
- what the measured bandwidth roof is on the target machine.

Then I want the point on the roofline.

If it is far left of the ridge, I ask byte questions:

- Can two passes become one?
- Can an intermediate stay in registers?
- Can a transpose or layout change make accesses coalesced?
- Can a sparse format reduce index traffic?
- Can a tile be reused more before eviction?

If it is far right of the ridge, I ask compute questions:

- Is the vector or tensor instruction path actually used?
- Is occupancy hiding latency?
- Are dependent operations serializing the loop?
- Is the compiler generating the expected instructions?
- Is the launch overhead larger than the useful work?

If it is near the ridge, life gets interesting. Small changes to either traffic
or arithmetic utilization can matter, and measurement error can change the
story. That is where I stop trusting napkin arithmetic and start collecting
counters.

## The Useful Lesson

Peak FLOPs are not fake. They are just incomplete.

They answer:

```text
how fast could arithmetic retire if data and instructions arrived perfectly?
```

The roofline asks a less glamorous question:

```text
how much arithmetic does each byte buy before the next byte is needed?
```

That question changes the emotional temperature of performance work. A slow
kernel is no longer automatically a failed attempt to use the math units. It may
be a perfectly predictable consequence of a low denominator.

The chip did not promise your code `60 TFLOP/s`.

It promised a roof.

You still have to climb to the right part of it.

[^roofline-osti]: Samuel Williams, Andrew Waterman, and David Patterson, "Roofline: an insightful visual performance model for multicore architectures", *Communications of the ACM* 52(4), 2009. [OSTI record](https://www.osti.gov/biblio/1407073).

[^roofline-pdf]: Samuel Williams, Andrew Waterman, and David Patterson, "Roofline: An Insightful Visual Performance Model for Floating-Point Programs and Multicore Architectures", accepted manuscript. The paper states the bound as attainable GFLOP/s equals the minimum of peak floating-point performance and peak memory bandwidth times operational intensity. [PDF](https://people.eecs.berkeley.edu/~kubitron/cs252/handouts/papers/RooflineVyNoYellow.pdf).

[^mccalpin]: John D. McCalpin, "Sustainable Memory Bandwidth in Current High Performance Computers", revised October 12, 1995. [HTML](https://www.cs.virginia.edu/~mccalpin/papers/bandwidth/bandwidth.html).

[^stream]: LLNL, "STREAM Summary Version 1.0", describing STREAM as a benchmark for sustainable memory bandwidth using simple vector kernels. [PDF](https://asc.llnl.gov/sites/asc/files/2020-06/STREAM_Summary_v1.0.pdf).

[^h100]: NVIDIA, "NVIDIA H100 GPU" product page, product specifications section. Accessed June 14, 2026. [Page](https://www.nvidia.com/en-us/data-center/h100/).
