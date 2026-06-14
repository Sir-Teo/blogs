---
layout: post
title: "Four Bits, One Outlier Tax"
description: "Quantizing a language model is not just rounding weights. A few large activation channels can spend the whole numerical budget for everyone else."
date: 2026-06-13 01:56:00 -0400
categories: ai-systems
tags: [quantization, llm-inference, numerical-analysis, compression, hardware]
excerpt: "Low-bit inference works when the quantizer spends its finite codes on the numbers that matter. Outliers make that budget political."
---

There is a version of quantization that sounds like storage engineering:

```text
float16 weights are large
int4 weights are small
therefore the model becomes cheaper
```

That story is true in the same way "a JPEG is smaller than a bitmap" is true.
It omits the interesting part: what information was thrown away, where the
error moved, and which numbers were allowed to keep precision.

Quantization is not merely compression. It is a negotiation over a finite set of
codes.

For a symmetric $$b$$-bit integer quantizer, choose a scale $$s$$, map a real
number to an integer grid, then dequantize it:

$$
\hat{x} = s \cdot \mathrm{clip}\left(\mathrm{round}(x/s), -Q, Q\right),
\quad Q = 2^{b-1}-1.
$$

The quiet danger is scale selection. If one activation channel is enormous, the
scale must be large enough to represent it. Then the ordinary channels inherit a
coarse grid. The outlier did not merely make itself hard to represent. It spent
the resolution budget for its neighbors.

This is the outlier tax.

## A tiny matrix with one expensive habit

The lab below builds a small matrix product $$Y = XW$$. The activation matrix
$$X$$ has a few high-magnitude channels, mimicking the outlier features observed
in large transformer inference. We then quantize activations and weights, run the
matrix product again, and measure the output error.

There are three escape hatches:

- smaller weight groups, so one row of weights does not share a scale with too
  many unrelated values;
- smoothing, which rescales activation channels down and weight rows up without
  changing the exact full-precision product;
- protecting salient channels, which keeps the highest-activation channels in
  higher precision while quantizing the rest.

<div class="quant-lab" data-quant-lab>
  <div class="quant-lab__controls">
    <label>
      Weight / activation bits: <output data-value="bits">4</output>
      <input type="range" min="2" max="8" value="4" data-param="bits">
    </label>
    <label>
      Weight group size: <output data-value="groupSize">32</output>
      <input type="range" min="4" max="64" step="4" value="32" data-param="groupSize">
    </label>
    <label>
      Outlier channels: <output data-value="outliers">5%</output>
      <input type="range" min="0" max="20" value="5" data-param="outliers">
    </label>
    <label>
      Outlier magnitude: <output data-value="outlierScale">12x</output>
      <input type="range" min="1" max="30" value="12" data-param="outlierScale">
    </label>
    <label>
      Smooth activations: <output data-value="smooth">55%</output>
      <input type="range" min="0" max="100" step="5" value="55" data-param="smooth">
    </label>
    <label>
      Protected channels: <output data-value="protected">2%</output>
      <input type="range" min="0" max="12" value="2" data-param="protected">
    </label>
  </div>
  <div class="quant-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="500" aria-label="Quantization simulator showing activation outliers and output error"></canvas>
  <div class="quant-lab__legend">
    <span><i style="background:#0f766e"></i> Ordinary channels</span>
    <span><i style="background:#b45309"></i> Outlier channels</span>
    <span><i style="background:#7c3aed"></i> Protected channels</span>
    <span><i style="background:#be123c"></i> Output error</span>
  </div>
  <p class="quant-lab__note">
    Synthetic deterministic experiment. It is not a benchmark for any particular
    kernel or model; it isolates the numerical failure mode of shared scales in a
    small matrix multiplication.
  </p>
</div>
<script defer src="{{ '/assets/js/quantization-lab.js' | relative_url }}"></script>

Try setting `Smooth activations` to zero, then increase `Outlier magnitude`.
The relative output error rises because the quantizer must cover a wider range.
The quiet-channel code usage falls: normal channels are mapped into fewer
integer bins. Now raise `Smooth activations` or `Protected channels`. The exact
matrix product before quantization is unchanged, but the quantized product has a
better budget.

That is the central trick. You do not always need to make the model smaller by
treating every number equally. You need to spend precision where the product is
sensitive.

## What the papers are really saying

LLM.int8() is a useful historical marker because it made the outlier story hard
to ignore. Dettmers, Lewis, Belkada, and Zettlemoyer showed that transformer
inference could be pushed into int8 while preserving full-precision performance,
but only after dealing with systematic emergent outlier features. Their method
uses vector-wise quantization for most values and a mixed-precision path for
outlier dimensions, while more than 99.9% of values are still multiplied in
8-bit.[^llmint8]

SmoothQuant attacks the same pain from a different angle. Xiao, Lin, Seznec,
Wu, Demouth, and Han observe that weights are easier to quantize than
activations. Their training-free transformation migrates quantization difficulty
from activations into weights, enabling W8A8 quantization across LLM matrix
multiplications and reporting up to 1.56x speedup with 2x memory reduction in
their setting.[^smoothquant]

AWQ pushes on salience. Lin and coauthors argue that not all weights matter
equally; protecting only about 1% of salient weights can substantially reduce
quantization error, and the salient channels should be identified using
activation statistics rather than weight magnitude alone.[^awq]

GPTQ uses another lens: second-order sensitivity. Frantar, Ashkboos, Hoefler,
and Alistarh use approximate curvature information for one-shot weight
quantization, reporting 3- and 4-bit GPT quantization with negligible degradation
for very large models in their experiments.[^gptq]

QLoRA then makes low-bit quantization part of a fine-tuning system. Dettmers,
Pagnoni, Holtzman, and Zettlemoyer backpropagate through a frozen 4-bit
quantized model into LoRA adapters, introducing NF4, double quantization, and
paged optimizers to fine-tune a 65B model on a single 48GB GPU while preserving
full 16-bit fine-tuning performance in their reported setup.[^qlora]

These papers are often grouped under one word, "quantization," but they solve
different accounting problems:

```text
LLM.int8():   isolate outlier dimensions
SmoothQuant: move dynamic range from activations to weights
AWQ:         protect activation-salient weight channels
GPTQ:        spend error according to curvature
QLoRA:       train adapters through a frozen low-bit base
```

The shared insight is that uniform precision is wasteful when sensitivity is not
uniform.

## The production mistake

The most common mistake is to ask only: "Can I load the model?"

The better questions are:

- Which layers have the largest activation outliers?
- Which channels set the activation scale?
- Does the calibration data contain the prompts that will create those outliers?
- Is the error concentrated in logits, attention projections, MLP projections, or
  rare-token behavior?
- Are we measuring perplexity only, or downstream decisions and tail failures?
- Does the serving kernel actually accelerate this quantization format on the
  target hardware?

Hugging Face's current Transformers documentation reflects the practical
landscape: quantization reduces memory and computational cost by using
lower-precision representations, and Transformers supports AWQ, GPTQ, and
bitsandbytes 8-bit and 4-bit paths.[^hf-quant] The bitsandbytes documentation
also exposes the operational split: LLM.int8() preserves higher precision for
critical computations, while QLoRA uses 4-bit quantization for trainable
adapter-based fine-tuning.[^bnb]

That last hardware point is not a footnote. A 4-bit checkpoint that lacks a fast
kernel can be a smaller model that runs disappointingly slowly. A quantization
format is a numerical method plus a memory layout plus a kernel contract.

## Next Experiments

I would like quantization reports to look less like "we used int4" and more like
an error budget:

```text
for each layer:
  activation range before and after smoothing
  channels responsible for the top 50% of quantization scale
  output error under calibration and stress prompts
  protected-channel budget
  kernel speed on the actual serving hardware
```

The next useful frontier is adaptive precision that is boring enough to operate:
not a complicated per-token miracle, but a measured rule that says which
channels, layers, and request classes deserve extra bits. Some precision should
be static, because kernels love regularity. Some should be conditional, because
outliers are conditional. The hard part is choosing where irregularity buys more
accuracy than it costs in systems complexity.

Quantization is successful when the cheap representation preserves the expensive
computation. The machine does not care that the checkpoint is small. It cares
whether the important dot products survived.

## Source Notes

[^llmint8]: Tim Dettmers, Mike Lewis, Younes Belkada, and Luke Zettlemoyer, "LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale," NeurIPS 2022. [arXiv](https://arxiv.org/abs/2208.07339).

[^smoothquant]: Guangxuan Xiao, Ji Lin, Mickael Seznec, Hao Wu, Julien Demouth, and Song Han, "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models," ICML 2023. [arXiv](https://arxiv.org/abs/2211.10438).

[^awq]: Ji Lin, Jiaming Tang, Haotian Tang, Shang Yang, Wei-Ming Chen, Wei-Chen Wang, Guangxuan Xiao, Xingyu Dang, Chuang Gan, and Song Han, "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration," MLSys 2024. [arXiv](https://arxiv.org/abs/2306.00978).

[^gptq]: Elias Frantar, Saleh Ashkboos, Torsten Hoefler, and Dan Alistarh, "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers," ICLR 2023. [arXiv](https://arxiv.org/abs/2210.17323).

[^qlora]: Tim Dettmers, Artidoro Pagnoni, Ari Holtzman, and Luke Zettlemoyer, "QLoRA: Efficient Finetuning of Quantized LLMs," NeurIPS 2023. [arXiv](https://arxiv.org/abs/2305.14314).

[^hf-quant]: Hugging Face Transformers documentation, "Quantization," accessed June 13, 2026. [Docs](https://huggingface.co/docs/transformers/en/main_classes/quantization).

[^bnb]: Hugging Face Transformers documentation, "Bitsandbytes," accessed June 13, 2026. [Docs](https://huggingface.co/docs/transformers/en/quantization/bitsandbytes).
