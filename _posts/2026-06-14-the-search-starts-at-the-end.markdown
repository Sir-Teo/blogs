---
layout: post
title: "The Search Starts At The End"
description: "The FM-index turns the Burrows-Wheeler transform into a searchable compressed index: exact matching becomes a right-to-left interval-narrowing game."
date: 2026-06-14 16:34:00 -0400
categories: computer-science
tags: [fm-index, burrows-wheeler-transform, suffix-array, string-search, bioinformatics, compression]
excerpt: "A suffix array sorts every possible future of a string. The Burrows-Wheeler transform stores the character just before each future. The FM-index makes that enough to search backward."
---

The fastest way to search a string can be to start at the end of the query.

That sounds like a trick until you see the data structure. The FM-index keeps a
compressed view of a text, then answers an exact-match query by reading the
pattern from right to left. Each character tightens an interval in a sorted list
of suffixes. When the interval is empty, the pattern is absent. When the interval
survives, the suffix-array rows inside it are the match positions.

The query does not scan the text.

It asks the index:

```text
which suffixes could still begin with the pattern I have reconstructed so far?
```

## Suffixes Are Futures

Take a text ending with a unique sentinel:

```text
banana$
```

Sort all suffixes:

```text
$        6
a$       5
ana$     3
anana$   1
banana$  0
na$      4
nana$    2
```

The suffix array is just the position column:

```text
[6, 5, 3, 1, 0, 4, 2]
```

Manber and Myers introduced suffix arrays as a compact alternative to suffix
trees for online string search: a sorted list of suffixes plus auxiliary
information can answer fixed-text, many-query substring questions while using
substantially less space in practice than suffix trees.[^suffix-array]

The suffix array is a map of every future of the string. If you know the rows
whose suffixes start with `ana`, their positions are the matches.

So far, this is an index, not a compression story.

The compression story begins with a column.

## The Last Column

For each sorted suffix row, write the character that appears immediately before
that suffix in the original cyclic text. For `banana$`, the last column is:

```text
annb$aa
```

That string is the Burrows-Wheeler transform. Burrows and Wheeler described it
as a reversible transformation that does not itself compress the data, but
reorders it so that simple compressors can exploit local clustering.[^bwt] The
reordering is the point: characters with similar following contexts tend to
stand near each other.

The surprising part is that the same transformed string can also be used for
search.

The FM-index combines:

- the BWT last column `L`;
- a small table `C[c]`, the number of characters in the text smaller than `c`;
- an occurrence counter `Occ(c, i)`, the number of `c` characters in `L[0:i)`;
- a sampled suffix array if positions are needed.

Then exact search uses this recurrence:

```text
left'  = C[c] + Occ(c, left)
right' = C[c] + Occ(c, right)
```

The interval `[left, right)` contains suffix-array rows matching the suffix of
the query processed so far. To prepend a new character `c`, use counts in the
last column to jump to the new interval. This is called backward search.

The text is present, but hidden behind ranks.

## The Backward Search Lab

The lab below builds a suffix array, BWT string, `C` table, and sampled
occurrence checkpoints for a tiny corpus. It verifies three things internally:
the BWT round-trips back to the original text, FM-index matches agree with a
naive scan, and sparse occurrence checkpoints trade less storage for more local
counting.

The default toy genome is:

```text
GATTACAGATTACAAGTCGATGATTACA$
```

Searching for `GATTACA` returns three positions: 0, 7, and 21. With checkpoint
stride 4, the lab stores 45 occurrence-counter cells instead of the 150 cells a
full `Occ` table would use. The query still works; it just scans short gaps
between checkpoints.

<style>
  .fm-lab {
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

  .fm-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .fm-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .fm-lab__controls input,
  .fm-lab__controls select {
    accent-color: #2563eb;
    box-sizing: border-box;
    font: inherit;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .fm-lab__controls input[type="text"],
  .fm-lab__controls select {
    background: #ffffff;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    color: #172026;
    padding: 0.36rem 0.45rem;
  }

  .fm-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .fm-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .fm-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .fm-lab__metric span,
  .fm-lab__legend,
  .fm-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .fm-lab__metric span {
    display: block;
  }

  .fm-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .fm-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 720px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .fm-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem 0.9rem;
    margin-top: 0.75rem;
  }

  .fm-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .fm-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.72rem;
    width: 0.72rem;
  }

  .fm-lab__note {
    margin: 0.8rem 0 0;
  }

  @media (max-width: 620px) {
    .fm-lab {
      padding: 0.85rem;
    }

    .fm-lab canvas {
      height: 1080px;
    }
  }
</style>

<div class="fm-lab" data-fm-index-lab>
  <div class="fm-lab__controls">
    <label>
      Corpus <output data-value="sample">toy genome</output>
      <select data-param="sample" aria-label="Corpus">
        <option value="genome" selected>toy genome</option>
        <option value="banana">banana</option>
        <option value="mississippi">mississippi</option>
        <option value="abracadabra">abracadabra</option>
      </select>
    </label>
    <label>
      Pattern <output data-value="pattern">GATTACA</output>
      <input type="text" data-param="pattern" value="GATTACA" spellcheck="false" aria-label="Pattern">
    </label>
    <label>
      Occ checkpoint stride <output data-value="stride">4</output>
      <input type="range" data-param="stride" min="1" max="8" step="1" value="4" aria-label="Occurrence checkpoint stride">
    </label>
    <label>
      Suffix row focus <output data-value="rowFocus">0</output>
      <input type="range" data-param="rowFocus" min="0" max="30" step="1" value="0" aria-label="Suffix row focus">
    </label>
  </div>
  <div class="fm-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="FM-index lab showing suffix array rows, backward search intervals, occurrence checkpoints, and text matches"></canvas>
  <div class="fm-lab__legend">
    <span><i style="background:#0f766e"></i>A</span>
    <span><i style="background:#2563eb"></i>C</span>
    <span><i style="background:#7c3aed"></i>G</span>
    <span><i style="background:#b45309"></i>T</span>
    <span><i style="background:#be123c"></i>Sentinel</span>
  </div>
  <p class="fm-lab__note">
    The implementation is intentionally small. It builds suffix arrays by sorting
    suffixes, not by using an industrial construction algorithm. The search logic
    is the FM-index part: BWT ranks narrow the suffix-array interval from right
    to left.
  </p>
</div>

<script defer src="{{ '/assets/js/fm-index-lab.js' | relative_url }}"></script>

Try `banana` with pattern `ana`. The final interval has two suffix-array rows,
which map to positions 1 and 3. Try `mississippi` with `issi`; the same
interval logic finds positions 1 and 4. Try a pattern that is absent. The
interval collapses to empty before the whole query has been consumed.

Now change **Occ checkpoint stride**. At stride 1, every occurrence count is
stored, so queries do no local counting. At stride 8, the index stores fewer
checkpoint cells and scans farther from the nearest checkpoint. The match
positions do not change. The cost accounting changes.

That is the FM-index bargain in miniature: store enough rank information to
search without scanning the text, but sample it enough to keep space low.

## Compression Became An Index

Ferragina and Manzini called their structure "opportunistic" because its space
falls with the empirical compressibility of the text while still supporting
full-text search.[^fm] The insight was not merely "compress the file, then
search it." It was to combine the Burrows-Wheeler transform with suffix-array
structure so that compression and indexing share machinery.

The word opportunistic is unusually apt.

If a text is repetitive, the BWT tends to create runs. Runs are friendly to
compression. Those same runs also make rank structures compact. The index takes
advantage of redundancy without needing to know in advance where the redundancy
will be.

This is why BWT-based indexing became so important in genomics. A human genome
is large, but it is not random. Short-read aligners need to ask a brutal number
of substring questions against a fixed reference. Bowtie used Burrows-Wheeler
indexing to align more than 25 million 35-base-pair reads per CPU hour with a
reported human-genome memory footprint of about 1.3 GB.[^bowtie] BWA similarly
used backward search with the BWT to align short reads while allowing mismatches
and gaps.[^bwa]

The production tools add the hard parts this toy ignores: inexact matching,
quality scores, seeding, paired reads, ambiguity codes, sampled suffix-array
recovery, engineering around cache behavior, and many biological edge cases.
But the quiet central move is already visible in the lab:

```text
rank in the last column tells you where to jump in the first column
```

## Why Backward?

Backward search feels odd only if you imagine the text as the thing being read.
The FM-index is not reading the text. It is maintaining an interval of sorted
suffixes.

After processing the last character of the pattern, the interval contains all
suffixes beginning with that character. After processing the previous character,
the interval contains all suffixes beginning with those two characters. Each
step prepends one character to the already-matched suffix.

The recurrence works because the first column of the sorted rotation matrix is
just the sorted characters, while the last column tells us what character
precedes each row's suffix in the original text. `Occ` preserves the relative
rank of equal characters. If this is the third `A` in the last column, it maps
to the third `A` in the first column.

That rank preservation is the little hinge.

Once you see it, the BWT stops being just a compression transform. It becomes a
coordinate system for moving through suffix-array rows.

## The Larger Lesson

There is a pattern here that shows up all over systems:

```text
the useful representation is the one that makes the next question cheap
```

A suffix array makes substring search cheap by sorting all suffixes. The BWT
makes compression cheap by grouping similar contexts. The FM-index notices that
those are not separate tricks. They are two views of the same sorted object.

That is what makes the structure feel elegant. It does not bolt an index onto a
compressed blob. It finds search inside the compression.

The search starts at the end because the index remembers what came before.

[^bwt]: M. Burrows and D. J. Wheeler, ["A Block-sorting Lossless Data Compression Algorithm"](https://www.cs.jhu.edu/~langmea/resources/burrows_wheeler.pdf), SRC Research Report 124, 1994.

[^suffix-array]: Udi Manber and Gene Myers, ["Suffix Arrays: A New Method for On-Line String Searches"](https://users.cs.utah.edu/~pandey/courses/cs6968/spring23/papers/suffixarray.pdf), *SIAM Journal on Computing*, 1993.

[^fm]: Paolo Ferragina and Giovanni Manzini, ["Opportunistic Data Structures with Applications"](https://people.unipmn.it/manzini/papers/focs00draft.pdf), *FOCS*, 2000. See also the authors' [abstract page](https://pages.di.unipi.it/ferragina/Libraries/fmindex/FM-pages/Abs_focs00.html).

[^bowtie]: Ben Langmead, Cole Trapnell, Mihai Pop, and Steven L. Salzberg, ["Ultrafast and memory-efficient alignment of short DNA sequences to the human genome"](https://link.springer.com/article/10.1186/gb-2009-10-3-r25), *Genome Biology*, 2009.

[^bwa]: Heng Li and Richard Durbin, ["Fast and accurate short read alignment with Burrows-Wheeler transform"](https://academic.oup.com/bioinformatics/article/25/14/1754/225615), *Bioinformatics*, 2009.
