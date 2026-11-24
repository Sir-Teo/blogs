---
layout: post
title: "Inside Inkling 2 Mini: how 24 layers think 48 layers deep"
description: >-
  An interactive prompt-to-output walkthrough of Thinking Machines Lab's Inkling
  2 Mini: 24 stored layers looping 3× into 48 visits, Block Attention Residuals,
  rank-64 cross-pass gates, pruned 128-expert NVFP4 MoE, coordinate d₂₀₂₇, and
  DSpark speculative decoding.
image: /assets/social/inside-inkling-2-mini.png
date: 2026-11-23 23:00:00 -0500
excerpt: >-
  Thinking Machines Lab's Inkling 2 Mini packs a 48-layer coding model into 24
  stored layers and a 19.53 GB native 4-bit checkpoint. Scrub through one token
  from prompt to output below.
links:
  - title: Announcement
    url: https://thinkingmachines.ai/news/inkling-2-mini/
  - title: Model card
    url: https://thinkingmachines.ai/model-card/inkling-2-mini/
  - title: Hugging Face
    url: https://huggingface.co/thinkingmachines/Inkling-2-Mini
  - title: modeling_inkling2_loop.py
    url: https://github.com/huggingface/transformers/blob/main/src/transformers/models/inkling2_loop/modeling_inkling2_loop.py
  - title: Goodfire study
    url: https://www.goodfire.com/research/interpreting-inkling-2-mini/
styles:
  - /assets/css/inkling-2-mini.css
scripts:
  - /assets/js/inkling-2-mini.js
---

On November 20, 2026, Thinking Machines Lab [released](https://thinkingmachines.ai/news/inkling-2-mini/) **Inkling 2 Mini** (Apache 2.0): a 26.4B-parameter model (5.4B effective active) that fits in a single **19.53 GB** native 4-bit checkpoint by running its middle 12 layers three times per token—turning 24 stored layers into 48 logical visits.

Watch one token travel from prompt to output below, or drag the timeline scrubber back and forth to trace how each pass sharpens the answer. Click any block in the diagram to inspect its exact math and verbatim `modeling_inkling2_loop.py` source.

<figure class="fig wide ink-mega" id="ink-mega" data-src="{{ '/assets/data/inkling-2-mini/data.json' | relative_url }}" style="--reserve: 660px">
<figcaption>Animated prompt-to-output walkthrough of <code>thinkingmachines/Inkling-2-Mini</code> built from <code>config.json</code>, <code>model.safetensors.index.json</code>, <code>modeling_inkling2_loop.py</code>, and Goodfire's interpretability study. Pick an example, scrub the timeline, or click any block or telemetry gauge to inspect its math, loop benchmarks, <code>d₂₀₂₇</code> ablation, and exact Python source.</figcaption>
</figure>

## From input token to output in six stages

Reading [`modeling_inkling2_loop.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/inkling2_loop/modeling_inkling2_loop.py) reveals that Inkling 2 Mini drops the standard residual stream and never feeds one loop's raw output straight into the next:

1. **<a class="act" href="#ink-mega" data-u="0.05">Input (`v₀`)</a>:** A prompt token (201K vocab, $$d = 2{,}304$$) and optional 20×20 patches from the 23-layer Vision Transformer (292M) RMS-normalize into Block 0 ($$\mathbf{v}_0$$), preserved untouched for every downstream layer.
2. **<a class="act" href="#ink-mega" data-u="0.17">Prelude (`L0–L5`, 1×)</a>:** Runs once (five sliding-1024 layers plus one global layer at `L5`), summing sublayer outputs into Block 1 ($$\mathbf{v}_1$$). Every layer replaces RoPE with hidden-conditioned relative position bias (`d_rel = 16`, `rel_extent = 1024`), four kernel-4 short convolutions, attention sinks, sigmoid output gating, and softcapped SwiGLU (`4.0 / 25.0`).
3. **<a class="act" href="#ink-mega" data-u="0.40">Loop Core (`L6–L17`, 3×)</a>:** Instead of one growing residual vector, **Block Attention Residuals** take a learned softmax mixture over normalized 6-layer block sums. At the start of <a class="act" href="#ink-mega" data-u="0.51">Pass 2</a> and <a class="act" href="#ink-mega" data-u="0.70">Pass 3</a>, the block list **resets back to the prelude** $$[\mathbf{v}_0, \mathbf{v}_1]$$ and reads Pass $$t-1$$'s core blocks $$[\mathbf{v}_2^{[t-1]}, \mathbf{v}_3^{[t-1]}]$$ through 48 rank-64 gates (28.3M params = 0.11% of the checkpoint):

$$
\boldsymbol{\kappa} = 1 - \tanh(\mathbf{F}\mathbf{z}), \qquad \boldsymbol{\gamma} = \tanh(\mathbf{G}\mathbf{z}), \qquad \mathbf{x}' = \boldsymbol{\kappa} \odot \mathbf{x} + \boldsymbol{\gamma} \odot \mathbf{m}_s.
$$

4. **<a class="act" href="#ink-mega" data-u="0.84">Coda (`L18–L23`, 1×)</a> → <a class="act" href="#ink-mega" data-u="0.96">Output + DSpark</a>:** The final six layers run once (last four in MXFP8) into softcapped 201K logits (`30.0`) to sample the next word, while the bundled 0.64 GB **DSpark** drafter taps visits `[5, 23, 41, 48]` to propose 7 continuation tokens (~4,400 tok/s/GPU on 1× GB200).

## Coordinate $$d_{2027}$$ and caveats

Scrub to <a class="act" href="#ink-mega" data-u="0.39" data-inspect="d2027">Pass 1's return (`+32.4`)</a> and then <a class="act" href="#ink-mega" data-u="0.76">Pass 3's exit (`−26.5`)</a> to see [Goodfire's mechanistic discovery](https://www.goodfire.com/research/interpreting-inkling-2-mini/): a single coordinate ($$d_{2027}$$) averages **+32.4 RMS-norm** (45.6% of total squared norm) at the end of Block 3 (`L17`) during Passes 1 and 2 so the next orbit locks onto Block 3, then fires a sharp **negative cleanup spike** on Pass 3 right before handing off to the coda. Because mid-block states live inside local sums, naive logit-lens fails mid-block while coda-lens and tuned-lens decode every orbit.

The tradeoffs are straightforward: weak closed-book recall (SimpleQA 8.4%, since looping adds compute rather than weight storage), lower multi-turn chat and dense constraint following than dense 27B rivals (MultiChallenge 50.0%, ComplexConstraints 33.4%), occasional debugging loops, and a 10.2% internal destructive-action rate that still requires sandboxing.

<details class="ink-methods" markdown="1">
<summary>Sources, verification records, and dataset build</summary>

Every architecture parameter, byte count, code excerpt, and benchmark score was verified directly against primary artifacts published November 20–23, 2026 and compiled by `_tools/inkling-2-mini/build_data.py` into one static JSON file:

- **Primary release & model cards:** Thinking Machines Lab, [*Introducing Inkling 2 Mini*](https://thinkingmachines.ai/news/inkling-2-mini/), [*Inkling 2 Mini Model Card*](https://thinkingmachines.ai/model-card/inkling-2-mini/), [*TML-d24-varloop-research Model Card*](https://thinkingmachines.ai/model-card/tml-d24-varloop-research/), [*End-to-End 4-Bit Training*](https://thinkingmachines.ai/blog/end-to-end-4-bit-training/) (Nov 13, 2026), and [*Introducing Inkling 2 Small*](https://thinkingmachines.ai/news/inkling-2-small/) (Nov 5, 2026).
- **Checkpoints & upstream code:** [`thinkingmachines/Inkling-2-Mini`](https://huggingface.co/thinkingmachines/Inkling-2-Mini) (`19,525,870,752` bytes + `0.64 GB` `mtp.safetensors`), [`thinkingmachines/TML-d24-varloop-research`](https://huggingface.co/thinkingmachines/TML-d24-varloop-research), and Hugging Face Transformers [`modeling_inkling2_loop.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/inkling2_loop/modeling_inkling2_loop.py).
- **Systems & interpretability:** Goodfire, [*Interpreting Inkling 2 Mini*](https://www.goodfire.com/research/interpreting-inkling-2-mini/) (Nov 20, 2026); [vLLM Day-0 Blog](https://vllm.ai/blog/2026-11-20-inkling2-mini); [Hugging Face Blog](https://huggingface.co/blog/inkling2mini); NDIF [*Looped Lens Challenge*](https://ndif.us/looped-lens-challenge) & [NNsight Guide](https://nnsight.net/blog/2026/11/20/opening-the-box-of-inkling-2-mini-using-nnsight-ndif/); Kimi Team (2026, [arXiv:2603.15031](https://arxiv.org/abs/2603.15031)).

[Compiled dataset (JSON)]({{ '/assets/data/inkling-2-mini/data.json' | relative_url }})

</details>
