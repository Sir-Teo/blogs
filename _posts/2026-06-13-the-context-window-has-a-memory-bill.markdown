---
layout: post
title: "The Context Window Sends a Memory Bill"
description: "Long-context inference is not only about attention math. Every live token leaves key and value vectors in GPU memory, and the serving system has to pay that bill one request at a time."
date: 2026-06-13 05:44:00 -0400
categories: machine-learning
tags: [kv-cache, llm-inference, long-context, attention, serving-systems, transformers]
excerpt: "A context window is not just a number in a model card. During decoding, it becomes a live memory object: keys and values for every retained token, every layer, every request."
---

The context window is usually sold as a length.

8k. 32k. 128k. A million tokens. The number sounds like a reading capacity:
how much text the model can see.

For inference, that framing is incomplete. A context window is also a resident
data structure. During autoregressive decoding, every previous token leaves a
key vector and a value vector in memory for every layer that will attend to it
again. That is the KV cache.

The KV cache is not a detail behind the curtain. It is often the object that
decides how many requests fit on a GPU, how much batching is possible, how much
long context costs, and why serving systems start to look suspiciously like
operating systems.

The short version:

```text
long context is a memory allocation problem pretending to be a prompt feature
```

## The Hidden State in Attention

Scaled dot-product attention is usually written as

$$
\mathrm{Attention}(Q,K,V)
=
\mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d}}\right)V.
$$

That equation from the Transformer paper is compact and beautiful.[^attention]
It also hides a deployment fact. During training or prefill, many tokens can be
processed in parallel. During incremental decoding, the model generates one
new token at a time. The new token supplies the query $$Q$$. The old tokens
supply the keys and values $$K,V$$.

If we recomputed all old keys and values at every decoding step, inference
would be absurdly wasteful. So the serving engine caches them. Caching saves
compute, but it creates a live memory bill:

$$
m_{\mathrm{token}}
=
2 \cdot L \cdot H_{\mathrm{kv}} \cdot d_{\mathrm{head}} \cdot b.
$$

Here:

1. $$2$$ is for keys and values.
2. $$L$$ is the number of layers.
3. $$H_{\mathrm{kv}}$$ is the number of key-value heads.
4. $$d_{\mathrm{head}}$$ is the head dimension.
5. $$b$$ is bytes per stored element.

For a 32-layer model with 32 KV heads, head dimension 128, and fp16 KV cache,
that is

$$
2 \cdot 32 \cdot 32 \cdot 128 \cdot 2
=
524{,}288
$$

bytes per token, or about half a MiB. A single 16k-token request then needs
about 8 GiB of KV cache before model weights, activations, runtime workspace,
fragmentation, or other requests enter the story.

Grouped-query attention changes this line item. If the model has 32 query heads
but only 8 KV heads, the KV cache drops by 4x. Multi-query attention goes
further and shares one set of keys and values across all query heads. Shazeer
proposed multi-query attention specifically because incremental decoding is
often bottlenecked by repeatedly loading keys and values from memory.[^mqa]
Ainslie et al. later framed grouped-query attention as an intermediate point
between full multi-head attention and MQA.[^gqa]

This is the first important lesson:

```text
KV heads are serving-system parameters, not just architecture trivia
```

They change the live memory footprint and the bandwidth read on every generated
token.

## A Small KV Cache Ledger

The lab below is deliberately an accounting model, not a benchmark. It uses the
formula above, then adds three serving-system details:

1. **Paging.** KV cache is allocated in token blocks, so partially filled blocks
   waste memory.
2. **Prefix sharing.** Requests may share a system prompt, retrieval prefix, or
   conversation prefix.
3. **Sliding windows.** Some systems retain only the most recent tokens, or a
   structured subset of old tokens.

Try the default setting first. It is a 7B-class grouped-query model with 8
concurrent requests, an 8k prompt, 1k generated tokens, fp16 weights, and fp16
KV. Then switch from GQA to MHA. The model did not get larger, but the cache
bill jumps because the number of KV heads changed.

<div class="kv-cache-lab" data-kv-cache-lab>
  <div class="kv-cache-lab__controls">
    <label>
      Model
      <select data-param="model">
        <option value="7b-gqa">7B class, GQA</option>
        <option value="7b-mha">7B class, MHA</option>
        <option value="70b-gqa">70B class, GQA</option>
      </select>
    </label>
    <label>
      GPU memory
      <select data-param="gpuMemory">
        <option value="80">80 GiB</option>
        <option value="24">24 GiB</option>
        <option value="48">48 GiB</option>
        <option value="141">141 GiB</option>
      </select>
    </label>
    <label>
      Attention window
      <select data-param="windowTokens">
        <option value="full">Full context</option>
        <option value="32768">32k sliding</option>
        <option value="16384">16k sliding</option>
        <option value="8192">8k sliding</option>
        <option value="4096">4k sliding</option>
      </select>
    </label>
    <label>
      Requests: <output data-value="requests">8</output>
      <input type="range" min="1" max="64" step="1" value="8" data-param="requests">
    </label>
    <label>
      Prompt tokens: <output data-value="promptTokens">8.2k</output>
      <input type="range" min="1024" max="65536" step="1024" value="8192" data-param="promptTokens">
    </label>
    <label>
      Generated tokens: <output data-value="generatedTokens">1.0k</output>
      <input type="range" min="0" max="4096" step="128" value="1024" data-param="generatedTokens">
    </label>
    <label>
      Shared prefix: <output data-value="sharedPrefix">30%</output>
      <input type="range" min="0" max="90" step="5" value="30" data-param="sharedPrefix">
    </label>
    <label>
      KV precision
      <select data-param="kvBytes">
        <option value="2">fp16 / bf16</option>
        <option value="1">int8</option>
        <option value="0.5">int4</option>
      </select>
    </label>
    <label>
      Weight precision
      <select data-param="weightBytes">
        <option value="2">fp16 / bf16</option>
        <option value="1">int8</option>
        <option value="0.5">int4</option>
      </select>
    </label>
    <label>
      Page block: <output data-value="blockSize">16</output> tokens
      <input type="range" min="8" max="128" step="8" value="16" data-param="blockSize">
    </label>
    <label>
      HBM bandwidth: <output data-value="bandwidth">1.6 TiB/s</output>
      <input type="range" min="0.4" max="4" step="0.1" value="1.6" data-param="bandwidth">
    </label>
  </div>
  <div class="kv-cache-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="650" aria-label="KV cache memory simulator showing model weights, cache allocation, paging slack, and decode bandwidth"></canvas>
  <div class="kv-cache-lab__legend">
    <span><i style="background:#64748b"></i> Model weights</span>
    <span><i style="background:#0f766e"></i> Allocated KV cache</span>
    <span><i style="background:#f59e0b"></i> Page slack</span>
    <span><i style="background:#14b8a6"></i> Shared prefix</span>
    <span><i style="background:#7c3aed"></i> Decode reads</span>
  </div>
  <p class="kv-cache-lab__note">
    Deterministic accounting model. It ignores tensor-parallel layout,
    allocator metadata, temporary workspaces, logits, communication, kernel
    details, and quality effects from KV quantization or context truncation. It
    is meant to expose the scaling law of the cache, not to predict a vendor
    benchmark.
  </p>
</div>
<script src="{{ '/assets/js/kv-cache-lab.js?v=20260613a' | relative_url }}"></script>

The four panels are different views of the same bill.

**Memory bill.** Model weights are the fixed rent. KV cache is the growing
working set. Page slack is memory paid to the allocator because blocks are
discrete. If the bar turns red, the selected workload does not fit in the GPU
budget.

**KV growth.** The green curve uses paging and prefix sharing. The red curve is
the same workload without sharing the prefix. A shared system prompt is not
only a prompt-engineering object; it can be a physical memory object.

**Paged layout.** This is the operating-system analogy. A logical sequence can
be stored in non-contiguous physical blocks. vLLM's PagedAttention made this
analogy explicit: partition the KV cache into fixed-size blocks, allocate on
demand, and use block tables rather than requiring each request to occupy one
contiguous slab.[^paged]

**Decode traffic.** For each new token, attention reads old keys and values.
The purple curve is the lower-bound HBM traffic from those reads. Real serving
engines have more work than this, but they cannot read fewer old keys and
values unless they reduce the retained context, reduce KV heads, compress KV,
or change the attention pattern.

## Paging Is Not Just an Implementation Detail

The old mental model is:

```text
request arrives
allocate a big continuous KV buffer
generate tokens
free the buffer
```

That works poorly when requests have different prompt lengths, generate
different numbers of tokens, arrive at different times, and share partial
prefixes. Memory becomes fragmented. Finished requests leave gaps. Long
requests reserve too much. Beam search and parallel sampling duplicate cache
state unless the runtime can share common prefixes.

PagedAttention imports a familiar idea from virtual memory. Store fixed-size KV
blocks. Let the logical sequence see a contiguous address space. Let the
physical blocks be scattered. Share physical blocks when logical sequences
share a prefix.

That is why the KV cache is not merely a tensor. It is a dynamic memory-managed
object with ownership, lifetime, aliasing, and fragmentation.

Orca made a related systems point from the scheduling side. Autoregressive
serving is iterative: after each decode step, some requests finish and others
continue. Request-level batching wastes opportunities; iteration-level
scheduling can refill the batch as sequences finish.[^orca] Paged KV memory and
iteration-level scheduling fit together because the serving engine is managing
a changing population of live sequences, not a static batch.

## FlashAttention Helps, But It Is a Different Bill

FlashAttention is one of the most important attention-system papers because it
made IO awareness central. It avoids materializing the full attention matrix
and uses tiling to reduce HBM traffic during attention computation.[^flash]

That matters enormously for training and prefill. But the persistent KV cache
is still there during decoding. FlashAttention can make attention computation
more efficient; it does not make old tokens stop needing keys and values if the
model is still allowed to attend to them.

This distinction is easy to blur:

```text
attention score matrix memory
is not the same as
persistent KV cache memory
```

The first can often be streamed or tiled away. The second is state that must
remain available for future decode steps.

## Sliding Windows Move the Bill

A sliding window is the most direct way to cap KV cache. Keep only the most
recent $$W$$ tokens. Then the per-request cache stops growing after $$W$$.

Mistral 7B used grouped-query attention and sliding-window attention as part
of its efficiency story.[^mistral] The idea is attractive because it turns an
unbounded per-request cache into a bounded one.

But dropping old tokens is not a neutral memory optimization. Some old tokens
are semantically important. Others are structurally important. StreamingLLM
showed that simply keeping the most recent window can fail, and that preserving
initial "attention sink" tokens can recover much of the behavior for streaming
generation.[^streaming]

So the real design space is not:

```text
full context or no context
```

It is:

```text
which old states are worth paying to keep?
```

That question is statistical, architectural, and product-specific. A chat app
with a stable system prompt, a code assistant reading a repository, and a
retrieval system with repeated boilerplate have different memory shapes.

## What I Would Log in Production

If I were responsible for a long-context serving stack, I would want the KV
cache to emit an audit log. Not just GPU utilization. A real cache ledger:

```text
request id
model and attention variant
prompt tokens
generated tokens
retained tokens
shared-prefix tokens
KV bytes allocated
KV bytes useful
block slack bytes
evicted tokens by policy
decode read bytes per step
time spent waiting for memory
time spent waiting for compute
```

This log would answer questions that average latency cannot:

1. Are we memory-bound because prompts are long, batches are wide, or KV heads
   are too many?
2. Are common prefixes actually being shared, or merely repeated?
3. Is page slack small enough to ignore?
4. Does KV quantization help throughput without hurting quality?
5. Which requests are evicting useful context?
6. Are we refusing work because of weights, KV cache, or allocator shape?

Without that ledger, "long-context performance" is too vague. It could mean
prefill latency. It could mean decode throughput. It could mean maximum
resident batch size. It could mean quality after truncation. These are different
metrics with different bottlenecks.

## The Next Question

The part I find most interesting is **cache policy as model behavior**.

A serving engine increasingly decides:

1. which prefixes to share;
2. which KV blocks to keep;
3. which old tokens to evict;
4. which states to compress;
5. which requests to batch together;
6. which long-context requests to reject or degrade.

Those are not neutral infrastructure choices. They can change the distribution
of answers. A code assistant that evicts early file imports may fail
differently from one that evicts repeated comments. A retrieval-augmented model
that shares boilerplate prefixes may get more throughput, but a prefix bug can
now affect many requests at once. A KV quantizer can make average perplexity
look fine while damaging rare long-range dependencies.

I would like to see more evaluation reports shaped like this:

```text
quality versus retained KV bytes
quality versus decode bandwidth
quality versus prefix-sharing strategy
quality versus eviction policy
quality versus KV quantization
tail failures by token age and document role
```

That would make the cache visible as part of the model. Because in deployment,
it is.

## Source Notes

[^attention]: Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit,
    Llion Jones, Aidan N. Gomez, Lukasz Kaiser, and Illia Polosukhin,
    "Attention Is All You Need," NeurIPS 2017.
    <https://arxiv.org/abs/1706.03762>

[^mqa]: Noam Shazeer, "Fast Transformer Decoding: One Write-Head is All You
    Need," 2019. <https://arxiv.org/abs/1911.02150>

[^gqa]: Joshua Ainslie, James Lee-Thorp, Michiel de Jong, Yury Zemlyanskiy,
    Federico Lebron, and Sumit Sanghai, "GQA: Training Generalized Multi-Query
    Transformer Models from Multi-Head Checkpoints," EMNLP 2023.
    <https://arxiv.org/abs/2305.13245>

[^paged]: Woosuk Kwon, Zhuohan Li, Siyuan Zhuang, Ying Sheng, Lianmin Zheng,
    Cody Hao Yu, Joseph E. Gonzalez, Hao Zhang, Ion Stoica, "Efficient Memory
    Management for Large Language Model Serving with PagedAttention," SOSP
    2023. <https://arxiv.org/abs/2309.06180>

[^orca]: Gyeong-In Yu et al., "Orca: A Distributed Serving System for
    Transformer-Based Generative Models," OSDI 2022.
    <https://www.usenix.org/conference/osdi22/presentation/yu>

[^flash]: Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, and Christopher Re,
    "FlashAttention: Fast and Memory-Efficient Exact Attention with
    IO-Awareness," NeurIPS 2022. <https://arxiv.org/abs/2205.14135>

[^mistral]: Albert Q. Jiang et al., "Mistral 7B," 2023.
    <https://arxiv.org/abs/2310.06825>

[^streaming]: Guangxuan Xiao et al., "Efficient Streaming Language Models with
    Attention Sinks," ICLR 2024. <https://arxiv.org/abs/2309.17453>
