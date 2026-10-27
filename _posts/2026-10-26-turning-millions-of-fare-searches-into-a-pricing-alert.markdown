---
layout: post
title: "How I’d build an airline pricing analysis product"
description: >-
  From supplier queues to comparable fares, anomaly detection and an
  analyst’s investigation: the schemas, calculations and query paths
  I’d build for an airline pricing analysis product.
date: 2026-10-26 21:00:00 -0400
excerpt: >-
  One fictional flight, followed through a pricing data pipeline.
  How I’d collect offers, model comparable prices, detect changes
  and make the evidence easy to query.
styles:
  - /assets/css/fare-system.css
---

Working on airline pricing taught me that the difficult part starts before the chart: two prices can refer to different products, be observed at different times, or include different taxes. I’d build the product around making those differences inspectable.

Here’s how I’d approach it from scratch. The design draws on what I learned, with generic component names and a fictional example: **A → B on November 17**, observed **October 27**, twenty-one days before departure. Our economy fare is **$240**; a competitor offers discount economy at **$220** and regular economy at **$270**. An airline’s revenue-management team uses this evidence when choosing which prices to offer.

## 1. Collect once, keep the evidence

I’d store collection definitions in Postgres: route, departure range, cabin, trip type, country of sale, sources, freshness limit and delivery deadline. Expand them into dated queries, merge duplicates, and retain a separate query-to-collection ownership table. Two teams requesting the same public search should share the supplier call.

Each provider gets a queue, a token-bucket rate limit and a concurrency cap. Workers fetch the reply; provider-specific parsers emit a common offer schema. I’d retain raw replies in object storage for parser replay, with normalized offers in a short-lived Redis cache. Reusing a cached result must preserve its original observation time.

<figure class="fig wide fs" id="fs-collect">
{% include fare-system/intake.html %}
<figcaption>Merged watchlists share source calls; cached replies retain their original observation times.</figcaption>
</figure>

A retry checks prior success and the deadline before choosing a substitute. Invalid currency or an unparseable price goes into a rejection log. It must never become a zero-dollar fare.

## 2. Build an offer table with a precise grain

The central table would contain **one itinerary offer, from one source, at one observation time**. I’d keep monetary amounts as decimal values or integer minor units, along with currency, tax basis, product group, booking class and fare restrictions. A normalized product group maps different airline bundle names onto a comparison category; it does not prove identical benefits.

A batch job joins offers to collection ownership, run metadata, exchange rates, city mappings and product mappings. Preserve the UTC observation timestamp separately from the customer’s local reporting date. Partition Parquet by customer and reporting date, cluster files by route, and compact small files. Avoid creating a partition for every search.

<figure class="fig wide fs" id="fs-commit">
{% include fare-system/storage.html %}
<figcaption>Different table grains, one shared dataset. Exports and analytics branch after curation.</figcaption>
</figure>

Customer exports get their own format, destination and release-delay policy. Analytics jobs track completion per batch and report late inputs. I’d avoid treating an export’s delivery time as the analytics completion signal.

## 3. Build a market view, then a detector

I’d group by route, departure, stops, cabin and trip type, including stay length for return trips. Within one collection run, compute minimum fares per cell, airline and product group. Convert currency on a declared basis; a return fare can be halved for a one-way equivalent, while retaining its trip and stay-length group.

The comparison rule matters: use the lowest product, match the same group, or use a cheaper alternative when it beats our fare. Store the selected product and rule with the result. Below, changing the rule changes a **$20 disadvantage into a $30 advantage**.

<figure class="fig wide fs" id="fs-compare">
{% include fare-system/signals.html %}
<figcaption>A market dashboard: current position, a scoped review queue and departure-level coverage.</figcaption>
</figure>

I’d detect unexpected movement against a **context-aware forecast**: the same market, product, weekday and days before departure. The prototype takes the median of eight matching historical weekdays and calibrates a range from fifty-six past walk-forward forecast errors. Today never helps set its own threshold.

Our competitor’s **$220** offer is **$15 below its $235 expected price**. That differs from its $20 gap to us. I’d require a move of at least $10 or 3%, whichever is larger, confirmed by two of three fresh observations in the same direction, at least ten minutes apart. Stale data, a missing selected source or changed product scope stops the pricing decision. Duplicate cache reads cannot provide extra confirmations.

Configured fare/class benchmarks remain separate. A $15 gap rule can match a perfectly ordinary price; that alone should not create an anomaly.

## 4. Let the analyst inspect the move

I’d build two read paths: route prices across departure dates from partitioned Parquet, and one departure’s observation history from a time-series table. The API checks customer access, resolves an explicit observation cutoff, and returns the data with its coverage and comparison rule. A small Parquet response lets DuckDB-WASM handle browser-side filtering.

<figure class="fig wide fs" id="fs-product">
{% include fare-system/investigate.html %}
<figcaption>Selected-flight review: observed versus expected prices, fresh source checks and partial fare-rule evidence.</figcaption>
</figure>

For diagnosis, join shopping results to published fares and evaluate supported restrictions. Our $210 fare clears a fourteen-day advance-purchase check. Other restrictions, a comparable tax basis and seats available in that booking class—the fare’s inventory bucket—still need checking before anyone can treat $210 as sellable.

I’d audit planned, received, accepted, packaged and delivered work separately. Compare expected work with actual results, keep failed jobs in a dead-letter queue, and distinguish supplier failures from genuine empty results. A missing competitor reply reduces coverage; it does not mean their price stayed unchanged.

I’d ship collection, exports and history first. Detection comes once I can reproduce the comparison behind a warning. That gives an analyst a useful first product—and gives me a way to debug it.
