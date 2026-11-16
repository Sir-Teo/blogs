---
layout: post
title: "Reading my own OpenAI export"
description: >-
  Forty-six months of ChatGPT and Codex logs from an 837 MB privacy export:
  12,429 conversations, 961 library files (2.04 GB), ~82.8 million tokens, and
  96.3 hours of recorded machine reasoning.
date: 2026-11-15 12:00:00 -0500
excerpt: >-
  I downloaded everything OpenAI keeps about me. 12,429 conversations, 961
  workspace files, ~82.8 million tokens, and 96.3 hours of thinking time across
  46 months: how a search box turned into a copy-paste workbench, and then into
  an hour-long background worker.
styles:
  - /assets/css/openai.css
scripts:
  - /assets/js/openai.js
---

ChatGPT's settings menu has an export button that promises an email link. Mine never showed up. After a week of waiting and two support tickets, an 837 MB zip finally landed in my inbox: 125 conversation shards, 961 workspace library files, 82 Codex tasks, Stripe invoices, and the support threads I opened asking where the zip was.

My first prompt is from February 16, 2023. Over the forty-six months since, I opened 12,429 conversations and sent 24,278 prompts across 5,311 work sessions and 1,114 active days.

Put end to end, the logs trace three distinct phases. In 2023 I treated the model like a search box that could do math. From mid-2024 through mid-2025 it was a copy-paste workbench where I dumped raw code and argued with stack traces across forty tabs a day. By 2026 I was barely typing—speaking ten-word directives, uploading whole repositories and PDFs, and letting a reasoning model work for an hour before reading its answer.

## The throughput inversion

<figure class="fig wide oai" id="oai-run" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 380px">
<figcaption>Monthly prompts, conversations, recorded thinking hours, and estimated token volume across the three phases from February 2023 to November 2026. <span class="only-hover">Hover or drag across months</span><span class="only-touch">Tap or drag across months</span> to sum a span.</figcaption>
</figure>

If you only count messages, my usage peaked during my final year at NYU. From <a class="act" href="#oai-run" data-view="prompts" data-range="2024-10,2025-03" data-month="2025-02">October 2024 through March 2025</a> I opened 4,382 chats, topping out in <a class="act" href="#oai-run" data-view="prompts" data-month="2025-02">February 2025</a> at 1,705 prompts.

Switch to <a class="act" href="#oai-run" data-view="thinking" data-range="2026-09,2026-11" data-month="2026-10">Thinking hours</a> or <a class="act" href="#oai-run" data-view="tokens" data-month="2025-02">Tokens</a> and the curve flips. The export begins recording wall-clock thinking timers in April 2025; by <a class="act" href="#oai-run" data-view="thinking" data-month="2026-10">October 2026</a> I was sending half as many prompts as in early 2025 while logging 25.5 hours of machine reasoning in a single month.

## Nine islands of work

<figure class="fig wide oai" id="oai-atlas" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 410px">
<figcaption>All 12,429 conversations projected onto a 2D spectral TF-IDF topic map with empirical covariance ellipses and the 2023 → 2026 yearly centroid shift.</figcaption>
</figure>

Projecting the corpus via spectral eigen-decomposition of its topic co-occurrence matrix separates the archive into nine clusters and tracks how the mean centroid shifted each year. In <a class="act" href="#oai-atlas" data-view="map" data-year="2023" data-cluster="2">2023</a>, a quarter of my chats sat in measure theory and probability proofs from my first semester in New York.

In <a class="act" href="#oai-atlas" data-view="map" data-year="2024" data-cluster="6">2024</a> and <a class="act" href="#oai-atlas" data-view="map" data-year="2025" data-cluster="0">2025</a>, the weight pulled toward job applications and deep-learning runs for my MRI segmentation thesis. Once I graduated, medical imaging vanished overnight and the <a class="act" href="#oai-atlas" data-view="map" data-year="2026" data-cluster="8">2026 centroid</a> shifted toward quant models, browser game ports, and everyday life, as shown on the <a class="act" href="#oai-atlas" data-view="stream" data-cluster="0">Quarterly topic stream</a>.

## Six handoffs in forty-six months

<figure class="fig wide oai" id="oai-models" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 370px">
<figcaption>All 25,518 final assistant replies grouped across six model generations and the top 16 individual model identifiers.</figcaption>
</figure>

Model loyalty in my log lasts until the afternoon its replacement ships. I switched from GPT-3.5 to GPT-4 the day I subscribed to Plus in <a class="act" href="#oai-models" data-view="share" data-month="2023-06">June 2023</a>, and moved 100% of my replies to GPT-4o in <a class="act" href="#oai-models" data-view="share" data-month="2024-06">June 2024</a>.

Reasoning models crossed half of my monthly replies in <a class="act" href="#oai-models" data-view="share" data-month="2025-02">February 2025</a> and passed 99% by <a class="act" href="#oai-models" data-view="share" data-month="2026-05">May 2026</a>. On the <a class="act" href="#oai-models" data-view="catalog" data-slug="gpt-5-6-thinking">Top 16 model slugs</a> view, each checkpoint hands off cleanly to the next the week it launches.

## Inside a 76-minute turn

<figure class="fig wide oai" id="oai-thinking" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 400px">
<figcaption>Node-by-node X-ray barcodes of six marathon reasoning runs, paired with log₁₀ duration quantiles across top models and effort tiers.</figcaption>
</figure>

In the export's tree structure, a single answer from a thinking model is a long chain of hidden nodes: internal thought blocks, mid-turn commentary updates, search calls, and a final reply. My <a class="act" href="#oai-thinking" data-view="xray" data-xray="0">longest single turn</a> ran for 76 minutes, while the <a class="act" href="#oai-thinking" data-view="xray" data-xray="1">densest turn</a> chained 187 assistant nodes in a row before printing its report.

Sometimes the visible reply is barely a receipt. On a <a class="act" href="#oai-thinking" data-view="xray" data-xray="5">36-minute poker solver run</a>, the model wrote 7,741 words of private reasoning and answered in 25 words handing over the finished deck. You can compare how those durations scale across <a class="act" href="#oai-thinking" data-view="models" data-model="gpt-6-pro">models</a> and <a class="act" href="#oai-thinking" data-view="effort" data-effort="extended">effort tiers</a>.

## Survival curves and branching trees

<figure class="fig wide oai" id="oai-trees" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 380px">
<figcaption>DAG tree topologies from five heavily branched threads, paired with the Kaplan–Meier conversation survival curve and turn-continuation probability.</figcaption>
</figure>

Sixty percent of my conversations end after a single question and answer, but the ones that survive Turn 3 keep going. On the <a class="act" href="#oai-trees" data-view="survival" data-k="1">Kaplan–Meier curve</a>, only 39.8% of chats reach a second turn; by <a class="act" href="#oai-trees" data-view="survival" data-k="6">Turn 6</a>, 69.0% continue to Turn 7.

When an early turn goes sideways, I rarely argue with the model—I back up and rewrite my prompt. Seven in ten branches across my 1,641 forked chats are edits to my own message, producing everything from a <a class="act" href="#oai-trees" data-view="trees" data-tree="0">23-leaf algebra derivation</a> to a <a class="act" href="#oai-trees" data-view="trees" data-tree="1">21-spoke starburst</a> from a single root node.

## How our prose drifted

<figure class="fig wide oai" id="oai-drift" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 390px">
<figcaption>Quarterly linguistic drift across all 25,518 assistant replies and 24,278 user prompts from early 2023 to late 2026 (dashed segments mark early quarters with fewer than 300 messages).</figcaption>
</figure>

Tracking vocabulary across sixteen quarters catches OpenAI's post-training habits changing in real time. Between 2023 and 2026, classic <a class="act" href="#oai-drift" data-side="assistant" data-metric="aiIsms">GPT-isms</a> (*"delve"*, *"crucial"*, *"tapestry"*) and <a class="act" href="#oai-drift" data-side="assistant" data-metric="syco">sycophantic openers</a> (*"Certainly!"*, *"Great question"*) fell tenfold, while <a class="act" href="#oai-drift" data-side="assistant" data-metric="emDashes">em-dashes</a> jumped 65-fold.

Flip to <a class="act" href="#oai-drift" data-side="user" data-metric="terse">My prompts</a> and the human side changes just as much. Once the model could read attached repositories and files directly, <a class="act" href="#oai-drift" data-side="user" data-metric="paste">500-word pastes</a> and <a class="act" href="#oai-drift" data-side="user" data-metric="polite">politeness</a> disappeared, replaced by terse directives of ten words or fewer.

## Two daily peaks and 2.04 GB of files

<figure class="fig wide oai" id="oai-rhythm" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 490px">
<figcaption>Four-year daily activity calendar and 24-hour prompt strip, the two-peak radial clock and weekday matrix versus Duolingo, and the 961 library files, web domains, and GitHub repos accessed.</figcaption>
</figure>

I opened ChatGPT on 81.5% of all days since early 2023, peaking at <a class="act" href="#oai-rhythm" data-view="calendar" data-year="2025" data-day="2025-02-25">122 prompts in a single day</a> and running an unbroken <a class="act" href="#oai-rhythm" data-view="calendar" data-year="2026" data-day="2026-11-13">252-day streak</a> in 2026. Unlike my late-night Duolingo habit, the <a class="act" href="#oai-rhythm" data-view="clock" data-hour="15">24-hour clock</a> peaks twice—at 3 pm during afternoon work and again at 11 pm.

The <a class="act" href="#oai-rhythm" data-view="world">961 files, search & repos</a> tab shows why my prompts got so short: in 2026 alone I uploaded or generated 958 workspace files totaling 2.04 GB (248 PDFs, 285 images, 64 Office workbooks and slide decks, 37 ZIP archives, and 25 videos), alongside 6,830 web search rounds, 1,690 GitHub repo attachments, and 82 Codex tasks.

## The 69.9% context tax

<figure class="fig wide oai" id="oai-arbitrage" data-src="{{ '/assets/data/openai/overview.json' | relative_url }}" style="--reserve: 380px">
<figcaption>Monthly subscription dollars billed ($784.47) versus estimated uncached API compute (~$1,100), paired with the quadratic multi-turn context re-transmission tax.</figcaption>
</figure>

In a multi-turn chat, every reply re-sends the prior conversation back into the context window. Reconstructing each turn's ancestor chain in <a class="act" href="#oai-arbitrage" data-view="context" data-k="6">Quadratic context tax</a> shows that roughly 34.0 million of my 48.6 million input tokens are old turns being re-read—making a ten-turn chat ingest 49 times as many cumulative input tokens as a single-turn question.

Pricing all ~82.8 million estimated tokens at historical uncached API rates puts the archive at <a class="act" href="#oai-arbitrage" data-view="arbitrage" data-month="2026-10">roughly $1,100 in API compute</a> against the $784.47 I paid in subscriptions—helped along by a <a class="act" href="#oai-arbitrage" data-view="arbitrage" data-month="2026-06">free month of Pro in June 2026</a> and a week of heavy reasoning runs in <a class="act" href="#oai-arbitrage" data-view="arbitrage" data-month="2026-11">autumn 2026</a>.

Four years in, the export reads less like a chat log and more like a history of what I stopped doing by hand: first the boilerplate, then the debugging loop, and finally the typing itself.

<details class="oai-methods" markdown="1">
<summary>Data, definitions, and what was left out</summary>

The source is the OpenAI privacy export (`OpenAI-export.zip`, 837.3 MB) generated on November 13, 2026. `_tools/openai-demo/build_data.py` reads `conversations-*.json` (125 shards), `library_files.json`, `codex.json`, and `Financial/*.csv` and writes `assets/data/openai/overview.json`. Emails, street addresses, phone numbers, IPs, account IDs, and raw conversation text are never written to the published file.

Timestamps are converted from UTC to `America/New_York`. *Prompts* count user `text` and `multimodal_text` messages (`24,278`). *Final replies* count non-empty assistant messages outside `channel: "commentary"` (`25,518`), while mid-turn progress updates use `commentary` (`3,837`). *Token and API-value estimates* (`~82.8M` tokens, `~$1,102` uncached upper bound) are reconstructed from character counts (`chars / 3.8`) and timed reasoning durations (`35 tok/s`) walking each reply's `parent` chain in `mapping` prior to server-side prompt caching or context truncation. The 2D topic map projects conversations via spectral eigen-decomposition of the empirical topic and session co-occurrence matrix, with $1.85\sigma$ covariance ellipses fit to each cluster's coordinates.

[Aggregated data (JSON)]({{ '/assets/data/openai/overview.json' | relative_url }})

</details>
