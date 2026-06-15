---
layout: post
title: "Tokenizers Set the Cover Charge"
description: "A tokenizer is not a neutral parser. A BPE merge table spends vocabulary on strings that were common in its reference corpus, changing the computational price of future text."
date: 2026-06-14 01:24:00 -0400
categories: ai-systems
tags: [tokenization, bpe, language-models, compression, tokenizer-free-models, representation-learning]
excerpt: "Subword tokenization solved the open-vocabulary problem by making rare strings decomposable. It also made a quieter bargain: familiar strings get cheap coordinates, unfamiliar strings pay in more tokens."
---

The first hidden model in a language model is often not a neural network.

It is the tokenizer.

We usually talk about tokenization as preprocessing, a little piece of plumbing
before the serious part begins. Text goes in, token ids come out, the transformer
does the learning. This is a useful engineering boundary. It is also a bad
mental boundary.

A tokenizer is a learned representation of a corpus. Its vocabulary says which
strings deserve their own coordinates. Its merge table says which adjacent
patterns were common enough to be fused into larger units. When a prompt arrives
later, the tokenizer does not merely "parse" it. It prices it.

```text
same characters
different merge table
different sequence length
different computational bill
```

That is the sense in which the merge table is a prior. Not a prior over truth,
and not a semantic theory of language. It is a prior over the strings that the
model will see cheaply.

## A Compression Trick Became a Doorway

Byte pair encoding started life as a compression algorithm. Philip Gage's 1994
algorithm repeatedly replaced a frequent adjacent byte pair with a new symbol,
recording a table so the original data could be reconstructed.[^gage] The
principle is almost embarrassingly local:

```text
find a frequent pair
merge it
repeat
```

For compression, this is a way to trade a dictionary for a shorter message. For
language models, the trade is stranger. The dictionary becomes an embedding
table. The shorter message becomes a shorter sequence of neural computation.

Sennrich, Haddow, and Birch adapted BPE-style subword units to neural machine
translation to address the open-vocabulary problem.[^sennrich] A word-level
translation system has an awkward cliff: if a word is outside the vocabulary,
the system needs a backoff mechanism. Subwords soften the cliff. Unknown names,
compounds, cognates, and morphology can be represented by smaller pieces.

SentencePiece pushed the preprocessing boundary again by training subword models
directly from raw sentences instead of assuming a separate pre-tokenized word
stream.[^sentencepiece] That matters because whitespace, punctuation, and
language-specific tokenization rules are not neutral either. If the point is an
end-to-end text model, the text boundary itself deserves suspicion.

The success of subword tokenization is real. It made fixed-vocabulary neural
models more robust to rare words and open text. But every solution leaves a
shape. A BPE tokenizer can spell any string from small pieces, but it does not
spell every string with the same number of pieces.

The corpus that trained the tokenizer leaves a bill of materials for future
text.

## Vocabulary Slots Are Subsidies

Suppose a raw-text BPE trainer starts with characters as symbols. At step \(k\),
it chooses the adjacent pair

$$
(a^\*, b^\*) = \arg\max_{(a,b)} c_k(a,b),
$$

where \(c_k(a,b)\) is the count of that pair under the current segmentation.
Then all non-overlapping appearances of \(a^\* b^\*\) are replaced by a new
symbol.

Ignoring overlap details, a merge with count \(c\) saves about \(c\) tokens on
the training corpus. The early merges usually buy obvious fragments: spaces with
common letters, suffixes, punctuation patterns, pieces of frequent words. Later
merges buy more specialized phrases. The merge budget is finite, so each merge
has an opportunity cost. Spending a token on `key_cache` means not spending that
rank on something else.

This turns tokenization into a quiet resource-allocation problem:

```text
vocabulary slots buy shorter sequences for a reference distribution
```

For dense attention, shortening a sequence from \(n\) to \(m\) changes the
attention comparison count from roughly \(n^2\) to \(m^2\). In autoregressive
generation, it also changes how many decoding steps are needed to emit the same
characters. During training, it changes where the loss is applied, which
embeddings receive updates, and how strings are broken across positions.

None of this means a tokenizer determines what a model can understand. Neural
networks are annoyingly good at learning around bad interfaces. But an interface
can still make one part of the world cheap and another part expensive.

Numbers, code identifiers, logs, names, romanized words, low-resource languages,
and domain-specific notation are exactly where this matters. They are often
compositional to a human and fragmented to a tokenizer trained elsewhere.

## Make Two Tokenizers Argue

The lab below trains two tiny BPE tokenizers in the browser. Both use the same
merge budget and the same greedy algorithm. The only difference is the reference
corpus.

The **general** tokenizer is trained on a mostly prose corpus. The **domain**
tokenizer is trained on a mixture you control: more code-like rows, more
number/log rows, or a balanced blend. Then both tokenizers encode the same probe
string.

This is not a production tokenizer. It is deliberately smaller and more
inspectable: raw text, deterministic training rows, character initialization,
greedy pair merges. The point is to make one mechanism visible. Change the
reference distribution, and the same future text receives a different price.

<style>
  .bpe-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .bpe-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  }

  .bpe-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .bpe-lab__controls input,
  .bpe-lab__controls select,
  .bpe-lab__controls textarea {
    accent-color: #0f766e;
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    width: 100%;
  }

  .bpe-lab__controls input[type="range"] {
    border: 0;
  }

  .bpe-lab__controls select {
    min-height: 2rem;
    padding: 0.25rem 0.4rem;
  }

  .bpe-lab__controls textarea {
    font-family: var(--font-mono);
    grid-column: 1 / -1;
    min-height: 4.4rem;
    padding: 0.55rem 0.65rem;
    resize: vertical;
  }

  .bpe-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .bpe-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .bpe-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.2rem;
    padding: 0.62rem 0.7rem;
  }

  .bpe-lab__metric span,
  .bpe-lab__legend,
  .bpe-lab__note,
  .bpe-lab__tokens h3,
  .bpe-lab__merge h3 {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .bpe-lab__metric span {
    display: block;
  }

  .bpe-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .bpe-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .bpe-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 1rem;
    margin-top: 0.65rem;
  }

  .bpe-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .bpe-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .bpe-lab__token-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-top: 0.9rem;
  }

  .bpe-lab__tokens,
  .bpe-lab__merge {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    padding: 0.7rem;
  }

  .bpe-lab__tokens h3,
  .bpe-lab__merge h3 {
    font-weight: 750;
    margin: 0 0 0.45rem;
    text-transform: none;
  }

  .bpe-lab__token-row {
    align-content: start;
    display: flex;
    flex-wrap: wrap;
    gap: 0.26rem;
    min-height: 4.6rem;
  }

  .bpe-lab__token {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 5px;
    color: #172026;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    line-height: 1.25;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 0.18rem 0.32rem;
  }

  .bpe-lab__token--number {
    border-color: #f2c78a;
  }

  .bpe-lab__token--punct {
    border-color: #b9cdf8;
  }

  .bpe-lab__token--space {
    color: #64748b;
  }

  .bpe-lab__probe {
    background: #ffffff;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    color: #46515c;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    margin: 0.7rem 0 0;
    overflow-wrap: anywhere;
    padding: 0.55rem 0.65rem;
  }

  .bpe-lab__merge ol {
    display: grid;
    gap: 0.3rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .bpe-lab__merge li {
    align-items: center;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: 2.2rem minmax(0, 1fr) 3.2rem;
  }

  .bpe-lab__merge code {
    background: #ffffff;
    border: 1px solid #e3e9ef;
    border-radius: 4px;
    color: #172026;
    display: block;
    font-size: 0.72rem;
    overflow: hidden;
    padding: 0.12rem 0.25rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bpe-lab__merge span {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
  }

  .bpe-lab__rank {
    color: #0f766e !important;
    font-weight: 750;
  }

  .bpe-lab__note {
    margin: 0.65rem 0 0;
  }
</style>

<div class="bpe-lab" data-bpe-prior-lab>
  <div class="bpe-lab__controls">
    <label>
      Code share: <output data-value="codeShare">55%</output>
      <input type="range" min="0" max="100" step="5" value="55" data-param="codeShare">
    </label>
    <label>
      Number/log share: <output data-value="numberShare">35%</output>
      <input type="range" min="0" max="100" step="5" value="35" data-param="numberShare">
    </label>
    <label>
      Merge budget: <output data-value="merges">96</output>
      <input type="range" min="12" max="180" step="4" value="96" data-param="merges">
    </label>
    <label>
      Probe
      <select data-param="probe">
        <option value="code">Code</option>
        <option value="market">Market log</option>
        <option value="english">English</option>
        <option value="rare">Rare string</option>
        <option value="custom">Custom</option>
      </select>
    </label>
    <label>
      Probe text
      <textarea data-param="customText" spellcheck="false">attention_scores = query @ key_cache.T / sqrt(head_dim)</textarea>
    </label>
  </div>
  <div class="bpe-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="640" aria-label="BPE tokenizer simulator comparing token counts under general and domain-specific merge tables"></canvas>
  <div class="bpe-lab__legend">
    <span><i style="background:#64748b"></i> General tokenizer</span>
    <span><i style="background:#0f766e"></i> Domain tokenizer</span>
    <span><i style="background:#2563eb"></i> Merge count curve</span>
  </div>
  <p class="bpe-lab__probe" data-current-probe></p>
  <div class="bpe-lab__token-grid">
    <div class="bpe-lab__tokens">
      <h3>General tokenizer pieces</h3>
      <div class="bpe-lab__token-row" data-general-tokens></div>
    </div>
    <div class="bpe-lab__tokens">
      <h3>Domain tokenizer pieces</h3>
      <div class="bpe-lab__token-row" data-domain-tokens></div>
    </div>
    <div class="bpe-lab__merge">
      <h3>First domain merges</h3>
      <ol data-merge-list></ol>
    </div>
  </div>
  <p class="bpe-lab__note">
    Deterministic toy experiment. The dense attention proxy is the selected
    probe's domain-token count squared divided by the general-token count
    squared. Lower than 1 means the domain tokenizer made this exact string
    cheaper under that crude compute proxy.
  </p>
</div>
<script defer src="{{ '/assets/js/bpe-prior-lab.js?v=20260614a' | relative_url }}"></script>

At the default setting, the code probe goes from 42 pieces under the general
tokenizer to 33 under the domain tokenizer. The crude dense-attention proxy
drops to about 0.62x. The market log only moves from 50 to 48 pieces, and the
rare string stays at 41 either way. The merge table helped where the reference
corpus had bought relevant fragments. It did not become a universal decoder.

Try three settings.

Raise **Code share** and keep the code probe selected. The general tokenizer can
spell `attention_scores` and `key_cache`, but it spends many smaller pieces. The
domain tokenizer starts buying underscores, suffixes, and identifier fragments.
The same string becomes shorter.

Now switch to the market-log probe and raise **Number/log share**. The advantage
moves. Date fragments, decimal patterns, and field-name syntax become worth
merging. Push the corpus toward code again and the market string can get more
expensive than it was under the general tokenizer. The merge table cannot make
everything cheap with a fixed budget.

Finally, use the rare-string probe. It does not become magically efficient just
because the tokenizer has seen "technical" text. A BPE table generalizes through
shared adjacent fragments, not through understanding. If the important pattern
is not frequent enough to buy merges, it falls back to smaller units.

## The Tax Is Not Only Token Count

Token count is the easiest thing to measure, so it is the thing the lab shows.
But the representational effect is broader.

An embedding table gives each token id a learned vector. A frequent token has a
single coordinate that can accumulate evidence across many contexts. A rare
string split into five pieces has to be reconstructed from smaller coordinates
and positions. That can be good if the pieces are meaningful. It can be bad if
the split cuts across the structure that mattered.

Consider identifiers. `retry_count` is not just the characters `r e t r y _ c`.
In code, the underscore is a boundary, `retry` is a concept, and `count` is a
role. A tokenizer trained on prose may see the underscore as punctuation noise.
A tokenizer trained on code may spend merges that preserve the idiom. Neither
choice is universally correct. The question is whether the chosen coordinate
system matches the task distribution.

Numbers are worse in a different way. A decimal string is simultaneously text,
syntax, and magnitude. Splitting it into arbitrary chunks can make arithmetic
look like spelling. Some models can learn the patterns anyway, but the tokenizer
has changed the path. It decides which chunks receive atomic embeddings, where
positional boundaries fall, and how many recurrent decoding decisions are
needed to emit or inspect the number.

This is why tokenization audits should be empirical. For a workload you care
about, measure:

1. how many tokens representative examples use;
2. where meaningful boundaries are cut;
3. which rare-but-important strings fragment badly;
4. how much the answer changes under another tokenizer or byte-level baseline.

The important comparison is not "does the tokenizer work on average?" It is
"which parts of my distribution are paying the tax?"

## The Token-Free Temptation

One response is to remove the learned vocabulary boundary altogether.

CANINE operates directly on character sequences and uses downsampling to make
the finer-grained input efficient enough for a deep encoder.[^canine] ByT5 asks
a similar question at the byte level: can a mostly standard Transformer process
raw UTF-8 bytes and avoid the preprocessing artifact? Its authors emphasize the
tradeoff directly: byte or character sequences are longer, but byte-level models
can be competitive and more robust on tasks sensitive to noise, spelling, and
pronunciation.[^byt5]

More recent tokenizer-free or tokenizer-light proposals keep circling the same
pressure point. T-FREE, for example, represents words through sparse activation
patterns over character triplets, aiming to avoid a reference-corpus tokenizer
while reducing the embedding and output-head burden.[^tfree]

The moral is not that subword tokenizers are obsolete. They remain a very good
engineering compromise. A byte-level model may pay a longer-sequence tax; a
subword model may pay a reference-corpus tax. The right question is not whether
there is a free representation. There is not.

The right question is which bill you want to itemize.

## Treat the Tokenizer Like Data

It is useful to treat a tokenizer the way we treat a training set, a benchmark,
or a labeling policy: as a dataset artifact with assumptions.

Ask where it came from. Ask what it makes cheap. Ask what it fragments. Ask
whether the target users write in the same style, language, notation, and
domain as the reference corpus. Ask whether your evaluation reports characters,
words, or tokens when comparing systems.

This matters even when model weights are frozen. Retrieval chunks are usually
budgeted in tokens. Prompt templates are budgeted in tokens. Tool traces,
source code, logs, citations, tables, and long-context documents are all priced
by a tokenizer before the model sees them. A ten percent token-count difference
is not an aesthetic detail when the context window, attention kernel, cache, and
billing system are all token-indexed.

The most dangerous phrase is "just preprocessing."

Preprocessing is where the world is discretized. Discretization is a model.

The merge table remembers a corpus. Then every future string negotiates with
that memory.

## Primary Sources

[^gage]: Philip Gage, "A New Algorithm for Data Compression," *The C Users Journal*, February 1994. [HTML mirror](https://www.pennelynn.com/Documents/CUJ/HTML/94HTML/19940045.HTM), [Semantic Scholar](https://www.semanticscholar.org/paper/A-new-algorithm-for-data-compression-Gage/1aa9c0045f1fe8c79cce03c7c14ef4b4643a21f8).

[^sennrich]: Rico Sennrich, Barry Haddow, and Alexandra Birch, "Neural Machine Translation of Rare Words with Subword Units," ACL 2016. [ACL Anthology](https://aclanthology.org/P16-1162/), [arXiv](https://arxiv.org/abs/1508.07909).

[^sentencepiece]: Taku Kudo and John Richardson, "SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing," EMNLP 2018 System Demonstrations. [ACL Anthology](https://aclanthology.org/D18-2012/), [arXiv](https://arxiv.org/abs/1808.06226).

[^canine]: Jonathan H. Clark, Dan Garrette, Iulia Turc, and John Wieting, "Canine: Pre-training an Efficient Tokenization-Free Encoder for Language Representation," TACL 2022. [ACL Anthology](https://aclanthology.org/2022.tacl-1.5/), [arXiv](https://arxiv.org/abs/2103.06874).

[^byt5]: Linting Xue, Aditya Barua, Noah Constant, Rami Al-Rfou, Sharan Narang, Mihir Kale, Adam Roberts, and Colin Raffel, "ByT5: Towards a Token-Free Future with Pre-trained Byte-to-Byte Models," TACL 2022. [ACL Anthology](https://aclanthology.org/2022.tacl-1.17/), [arXiv](https://arxiv.org/abs/2105.13626).

[^tfree]: Bjorn Deiseroth, Manuel Brack, Patrick Schramowski, Kristian Kersting, and Samuel Weinbach, "T-FREE: Subword Tokenizer-Free Generative LLMs via Sparse Representations for Memory-Efficient Embeddings," EMNLP 2024. [ACL Anthology](https://aclanthology.org/2024.emnlp-main.1217/), [arXiv](https://arxiv.org/abs/2406.19223).
