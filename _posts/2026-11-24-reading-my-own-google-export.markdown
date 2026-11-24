---
layout: post
title: "Reading my own Google export"
series: exports
description: >-
  Eighteen months of YouTube history, 270 days of IP-geolocated logins, and
  212,345 server handshakes in 28 days from a Google Takeout export: more ads
  than videos until one October night, a turned-off Timeline that still mapped
  the year, and five distinct clocks inside one account.
image: /assets/social/reading-my-own-google-export.png
date: 2026-11-24 12:00:00 -0500
excerpt: >-
  I downloaded what Google keeps on my account. Seven files unpacked to 41.1 MB:
  3,906 YouTube ads stuffed into both watch and search logs, 1,019 background
  Maps logins that traced a year of travel with Location History turned off, and
  212,345 server pings in four weeks.
styles:
  - /assets/css/google.css
scripts:
  - /assets/js/google.js
---

I asked Google Takeout for what it keeps on my account. Three zips came back, unpacking into seven files totaling 41.1 MB: YouTube watch and search history, an 8.5-year account ledger, a 270-day login table, a list of devices, Timeline settings, and 28 days of raw server access logs.

The first thing that broke my mental model sat right at the top of YouTube. More than half of `watch-history.html` (3,906 of 7,270 rows) was not videos I watched, and 86.7% of `search-history.html` (3,244 of 3,742 rows) was not queries I typed. It was Google Ads. Google had written 3,189 of the same ad impressions into both files, outnumbering my 496 real searches more than six to one.

Every figure below runs in the browser on one aggregated file built from the export. My email, phone number, IP addresses, account ID, birthday, and exact home suburbs never leave my machine.

## More ads than videos, until October 23

<figure class="fig wide goog" id="goog-ads" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 380px">
<figcaption>Daily organic YouTube and YouTube Music plays (up) versus Google Ads (down) across October and November 2026, paired with the 18-month ads-per-video sparkline above and a scrubbable replay of the final 39-second burst below.</figcaption>
</figure>

On March 3, 2026, when I was seeing one ad for every ten videos, YouTube popped up a survey asking me to rate my recent ad experience. I clicked *Good*. Over the next six months the load climbed from 0.10 ads per organic video to 3.76 in September, peaking at <a class="act" href="#goog-ads" data-day="2026-10-11">106 ads in a single day</a> on October 11. Almost three-fifths of all ads arrived within sixty seconds of the previous one as feed and Shorts cards fired past my thumb, led by AI dev tools and software—Google AI and Gemini (162), Cursor (125), Loom (92), Bilt (66), and Grok Bot (41)—with 58.8% hidden behind opaque agency filenames and just seven clicks out of 3,906 impressions (a 0.18% click-through rate).

Then came the cliff. On <a class="act" href="#goog-ads" data-day="2026-10-19">October 19</a>, YouTube Music suddenly appears after sixteen months at zero, and ads stop. Four nights later, `ChangeHistory.html` shows my Google One membership dropping off at 8:10 pm EDT. Hit <a class="act" href="#goog-ads" data-day="2026-10-23" data-replay="1">Replay Oct 23 23:48</a> to watch what leaked through that 3-hour-41-minute lapse: six ads fired in 39 seconds ending on a Liberty Mutual commercial at 11:48:49 pm, and 149 seconds later Google One switched back on. Across the next 31 days and more than a thousand plays, Google logged zero ads, and my daily pace jumped from 4.3 organic plays a day to 33.6.

## From English to Chinese, and then to myself

<figure class="fig wide goog" id="goog-culture" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 330px">
<figcaption>Left: 1,076 YouTube channels packed around my own channel with 787 one-off channels orbiting as outer dust. Right: concentric vinyl repeat grooves for my top eight YouTube Music tracks with an interactive tonearm and 33⅓ RPM turntable.</figcaption>
</figure>

In 2025, YouTube was mostly an English habit: Chinese titles stayed under 10% of my watch history. A sudden February 2026 blip was 48 Japanese Shorts from a single creator (`mimi kiddy`) in two minutes. Then, across summer 2026, Chinese variety shows, food channels (`丹牛食`, `元气八眉菌`), and Mandopop took over, hitting 71.0% of all YouTube videos in September before my own channel became <a class="act" href="#goog-culture" data-ch="0">#1 overall with 179 views</a> (147 of them in November while checking edits and uploads).

The two surfaces behave like opposite universes. On YouTube Video, 91.8% of plays are unique videos across 1,076 distinct channels, and 787 of those channels—73.1%—show up once and never again. Switch your gaze to the turntable on the right and <a class="act" href="#goog-culture" data-spin="1">spin the vinyl</a>: on YouTube Music, 39.5% of plays are repeats, led by <a class="act" href="#goog-culture" data-song="0">It Was A Good Day</a> (17 plays) and <a class="act" href="#goog-culture" data-song="1">Out of Time</a> (14 plays).

## Five clocks inside one Google account

<figure class="fig wide goog" id="goog-rhythm" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 430px">
<figcaption>Draggable 3D circadian helix of all 7,259 YouTube videos (blue), YouTube Music tracks (teal), and Google Ads (amber) across 531 days and 24 hours. Drag to orbit, look down the empty 4–5 am sleep corridor, or sweep chronologically.</figcaption>
</figure>

At first glance the raw Takeout timestamps looked wrong: my YouTube history peaked at 11 pm in summer and midnight in winter. The culprit is a quiet Google export bug. Takeout prints every timestamp in fixed UTC-5 (`EST`) all year, even in July, shifting summer wall-clock time backward by an hour. Toggle <a class="act" href="#goog-rhythm" data-raw="1">Show EST −1h bug</a> to watch all 7,259 points physically rotate by an hour in 3D, or <a class="act" href="#goog-rhythm" data-sweep="1">sweep the 18-month timeline</a> to watch the golden ad shell swell through September and stop dead on October 23.

Once corrected to true Eastern time, the helix reveals a stark hollow corridor: zero organic YouTube plays at 4 am or 5 am across all 18 months. Inside this single Google account, five separate clocks run at once—YouTube Video and Search both peak at midnight (317 watches and 18.1% of searches), YouTube Music spikes at 8 am and 4–5 pm (35.0% in two afternoon commute hours), Android TV stays silent from 1 am through 8 am before peaking at 7 pm (1,049 pings), and background machine pings never sleep at all.

## How a two-minute preview becomes a 39-video drift

<figure class="fig wide goog" id="goog-sessions" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 280px">
<figcaption>Interactive arc replay of six real sessions showing same-topic loops (blue) versus topic jumps and search query stems (amber). Select a session or press Replay to trace each hop.</figcaption>
</figure>

Grouping consecutive organic plays separated by 30 minutes or less yields 854 sessions. Almost three-quarters (73.0%) start cold on the recommendation feed with zero search queries and average 3.13 videos. The remaining 27.0% that involve a search run nearly twice as deep, averaging 6.07 plays. Even without video durations in Takeout, the inter-play gaps reveal each surface's format: 39.2% of YouTube Video gaps are under 60 seconds (median 101 seconds, dominated by Shorts and previews), while 49.5% of YouTube Music gaps cluster tightly in the 2-to-5-minute song window (median 178 seconds).

Select <a class="act" href="#goog-sessions" data-xray="0" data-play="1">Midnight 39-video drift</a> to replay a real late-night rabbit hole on November 12: it opens on *Nathan For You*, veers through NBA clips, pivots into PS6 and GTA 6 queries, and lands on The Weeknd 109 minutes later. Contrast that with <a class="act" href="#goog-sessions" data-xray="2" data-play="1">48 Shorts in two minutes</a> from February 24 or <a class="act" href="#goog-sessions" data-xray="3" data-play="1">30 rapid clicks on my own uploads</a> in four minutes.

## Location History was off. My login table mapped the year anyway.

<figure class="fig wide goog" id="goog-geo" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 430px">
<figcaption>Draggable 3D travel globe reconstructed from 270 days of Google Account login IP geolocations with Location History turned off. Drag to spin 360° or press Replay 270 days to watch the year unfold.</figcaption>
</figure>

`Timeline/Settings.json` is unambiguous: Location History is off (`historyEnabled: false`), Timeline is off (`timelineEnabled: false`), saved history was deleted on May 5, 2024, and my phone reports `hasSavedTimelineData: false`.

Then I opened `SubscriberInfo.html`. Its security login table keeps 2,058 timestamped logins from February 27 through November 23, 2026, each stamped with an IP geolocation across 53 raw city and region strings (grouped here to metro areas). Fully 67.5% of the entire table—1,390 logins—are non-interactive background token refreshes I never typed a password for. The iOS Google Maps app alone generated 1,019 of them, 100% in the background, followed by 261 from iOS YouTube and 61 from iOS Chrome.

Press <a class="act" href="#goog-geo" data-replay="1">Replay 270 days</a> or spin the globe to <a class="act" href="#goog-geo" data-hub="Black Hills">Black Hills</a>: those silent handshakes trace my 2026 travel calendar without GPS—San Francisco, New York, Austin, Honolulu in June, Dallas in July, Lake Tahoe in August, a September loop through Denver, Wyoming, and South Dakota, Minneapolis in October, Toronto, and Los Angeles. IP geolocation is still noisy: mobile carrier gateways pull some pings toward regional hubs mid-trip, and rotating around the North Pole to <a class="act" href="#goog-geo" data-hub="Guangdong">Guangdong, China</a> reveals three interactive `Chrome on Linux` remote server logins while my phone sat in Los Angeles.

## 212,345 server handshakes in 28 days

<figure class="fig wide goog" id="goog-pings" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 430px">
<figcaption>Draggable 3D isometric seismograph of all 672 individual hours in Access Log Activity across 28 days, rising beneath a dashed 64 hits/sec ceiling plane. Drag to orbit or hover any column to inspect the exact hour.</figcaption>
</figure>

The single largest file in the archive is a 28 MB CSV covering just four weeks (October 27 to November 23): 212,345 authenticated requests across 642 IP addresses, or one handshake every eleven seconds. Normal Mac, iOS, and TV traffic sits in quiet blue daytime ridges until two machine storms erupt out of the grid: a headless `Chrome on Linux` run pouring 38,390 requests through the night on <a class="act" href="#goog-pings" data-day="2026-11-01" data-hour="9">November 1</a> (5,668 in a single hour at 9 am, including 2,641 Drive hits), followed by 50,288 blank-user-agent requests across <a class="act" href="#goog-pings" data-day="2026-11-05" data-hour="19">November 4 and 5</a>.

Tilt to the <a class="act" href="#goog-pings" data-angle="sleep">2–6 am sleep trench</a> to separate the human from the daemons: between 2 am and 6 am, human-driven apps (YouTube, Chrome Sync, Maps, Search) drop to 0.8% of their daily traffic and Android TV hits zero, while blank-UA and Linux traffic puts 17.6% of its volume inside the sleep hours. Across the whole file, 91.6% of rows are labeled simply `Product Name = Other`, and the busiest individual seconds slam into a flat ceiling at exactly 64 rows per second (15 times on Mac Chrome, never 65).

## Four clocks of retention

<figure class="fig wide goog" id="goog-account" data-src="{{ '/assets/data/google/overview.json' | relative_url }}" style="--reserve: 280px">
<figcaption>Telescoping four-layer geological core sample of the Takeout archive: each outer bar expands its rightmost retention sliver into the denser window below.</figcaption>
</figure>

Opening a Google Takeout export feels less like reading one diary and more like cutting a core sample through four different geological strata. Time and volume invert completely: the <a class="act" href="#goog-account" data-layer="3">final 28-day sliver</a> is just 0.9% of my account's 8.5-year age, yet it holds 94.2% of every row in the archive (212,345 of 225,443 total records). Step outward and each layer thins while reaching further back—<a class="act" href="#goog-account" data-layer="2">270 days</a> for login geolocations and 39 OS-fragmented device tokens across roughly five physical machines, <a class="act" href="#goog-account" data-layer="1">18 months</a> for YouTube history, and all the way to <a class="act" href="#goog-account" data-layer="0">May 9, 2018</a> for the 28-row Account Change History.

Taken together, the seven files record far less of what I intentionally gave Google than of everything running underneath: ads duplicated into my search log, background map tokens refreshing across states while Timeline was switched off, and 212,345 server handshakes in a month where I barely noticed talking to Google at all.

<details class="goog-methods" markdown="1">
<summary>Data, definitions, and what was left out</summary>

The source is a three-part Google Takeout export generated on November 23, 2026 (41.1 MB unpacked across seven files: `watch-history.html`, `search-history.html`, `Activities.csv`, `Devices.csv`, `Timeline/Settings.json`, `SubscriberInfo.html`, and `ChangeHistory.html`). `_tools/google-demo/build_data.py` reads only those local files and writes `assets/data/google/overview.json`. Emails, phone numbers, raw IP addresses, Gaia IDs, birthdates, DUSI challenge tokens, ad tracking query parameters, and exact home-suburb names are stripped before writing.

*YouTube timestamps* in Takeout HTML are exported as fixed UTC-5 (`EST`) year-round, verified against embedded UTC `"Watched at"` strings in summer and winter rows; the build script converts fixed UTC-5 to UTC and then to `America/New_York` so summer EDT hours align with wall-clock time. *Organic watches* (`3,353`) count `Watched` rows outside `From Google Ads` (`2,727` YouTube video, `626` YouTube Music), excluding `3,906` ad impressions, `8` organic community posts (`Viewed`), `2` surveys (`Answered`), and `1` non-ad link click (`Visited`). *Sessions* (`854`) group chronological organic plays separated by 30 minutes or less; a session counts as *searched* (`231`) if any of the `496` organic search queries falls between 5 minutes before the first play and the final play. *Metro hubs* group `53` raw IP-geolocation strings from `SubscriberInfo.html` into regional metros (folding Boston-area suburbs into `Greater Boston, MA`) and flag interactive `Chrome on Linux` entries in China separately as remote hosts.

[Aggregated data (JSON)]({{ '/assets/data/google/overview.json' | relative_url }})

</details>
