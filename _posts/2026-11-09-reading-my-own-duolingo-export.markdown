---
layout: post
title: "Reading my own Duolingo export"
description: >-
  Six years of Duolingo data from a privacy export: 151 league weeks, 1,266
  store items, and 535 active days—how a 2024 sprint to Diamond turned into a
  quieter late-night habit that got there again for a fraction of the XP.
date: 2026-11-09 22:00:00 -0500
excerpt: >-
  I downloaded everything Duolingo keeps about me. 151 league weeks, 1,266
  store items, and 535 active days later: one big sprint, a long late-night
  habit, and a second trip to Diamond for a fraction of the XP.
styles:
  - /assets/css/duolingo.css
scripts:
  - /assets/js/duolingo.js
---

Duolingo will send you everything it keeps about you if you ask. Mine came back as a zip of sixty files: CSV tables, a few protobuf dumps, and nine sizes of my own avatar. Most of it is account plumbing. Three files hold the interesting part: a weekly league history, a log of every item I ever activated in the shop, and the state of my Spanish course.

I made the account on May 5, 2020. Then I didn't use it for three and a half years. Everything below comes from what happened after I came back.

Every figure runs in the browser on one aggregated file built from the export. The script that builds it keeps only dates, counts, and tiers. My email, IP addresses, device tokens, and birthdate never leave my machine.

## One sprint and a long tail

<figure class="fig wide duo" id="duo-run" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 350px">
<figcaption>Weekly XP bars and league tier across all 151 active weeks. <span class="only-hover">Hover or drag across a span of weeks</span><span class="only-touch">Tap or drag across weeks</span> to sum its XP; switch to Calendar time to show the 3½-year gap between May 2020 and January 2024.</figcaption>
</figure>

On the calendar, the first thing you see is the <a class="act" href="#duo-run" data-view="calendar" data-week="2020-05-01">empty stretch</a>: two weeks in 2020 with zero XP, then nothing until January 9, 2024. Within hours of coming back I had paid for a month of Super.

Then came <a class="act" href="#duo-run" data-view="weeks" data-range="2024-01-01,2024-12-31">2024</a>. That year accounts for 99,018 of my 128,780 league XP, or 77% of six years. The <a class="act" href="#duo-run" data-view="weeks" data-week="2024-07-01">best single week</a> was 5,833 XP in early July. In 2025 I earned 18,630 XP all year, and so far in 2026 it's 11,132. The habit stuck around. The volume didn't.

## Climbing the ladder, twice

<figure class="fig wide duo" id="duo-ladder" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 330px">
<figcaption>Every league week since January 2024 across the ten leagues and the Diamond Tournament, paired with total weeks spent at each tier. Dot area scales with weekly XP; blue dots promoted, amber dots demoted, and hollow dots stayed put.</figcaption>
</figure>

Duolingo sorts you into a 30-person league every week. Finish near the top and you move up; finish near the bottom and you drop. When I came back I started in Bronze and <a class="act" href="#duo-ladder" data-span="2024-01-09,2024-03-11" data-week="2024-03-11">went up nine weeks in a row</a>, reaching Diamond on March 11. I lasted one week there. That ten-week run cost 40,705 XP, often more than 5,000 a week.

After that I settled into the middle. <a class="act" href="#duo-ladder" data-view="time">Amethyst</a> is where I spent the most weeks (34), and I ended up with 53 promotions against 44 demotions.

The second climb is the one I find more interesting. Starting in <a class="act" href="#duo-ladder" data-span="2026-08-02,2026-11-09" data-week="2026-10-05">August 2026</a>, I went from Ruby back to Diamond and into the Diamond Tournament. This week I'm in its third round. In March 2024 the week that got me into Diamond took 5,272 XP. In September 2026 the same promotion took 266. I was doing about a twentieth of the work. Either my leagues got much quieter, or the people around me were also coasting.

## 535 days

<figure class="fig wide duo" id="duo-calendar" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 390px">
<figcaption>One square per day from 2024 to 2026, shaded by how many store items I activated. <span class="only-hover">Hover or click</span><span class="only-touch">Tap</span> any day to plot its exact session timestamps along the 24-hour strip below.</figcaption>
</figure>

The export has no daily XP log, but it does record every boost, timer, and pass I ever started, to the second. Most of them begin right after a lesson ends, so they're a decent stand-in for the days I actually opened the app. That gives at least 535 active days. Any day where I did a lesson but didn't trigger an item is missing, so the real number is higher.

The <a class="act" href="#duo-calendar" data-year="2024" data-day="2024-03-20">busiest day</a> was March 20, 2024, with fifteen items. The longest unbroken run is 36 days, ending March 7, 2024, right in the middle of the climb. In <a class="act" href="#duo-calendar" data-year="2025">2025</a> the squares get sparse through the spring and fill back in from August, and <a class="act" href="#duo-calendar" data-year="2026">2026</a> follows the same pattern.

## After 8 pm

<figure class="fig wide duo" id="duo-clock" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 370px">
<figcaption>Items activated by hour of the day and by weekday × hour in Eastern time. Wedge radius grows with the square root of the count so wedge area tracks volume; blue wedges fall between 8 pm and 5 am.</figcaption>
</figure>

I don't do Duolingo at breakfast. <a class="act" href="#duo-clock" data-year="all" data-hour="23">The 11 pm hour</a> alone holds 23% of everything, and 79% of all items land between 8 pm and 5 am. More than a quarter come after midnight. That's the streak doing its job: the lesson that keeps the flame alive is the one I squeeze in before bed.

The pattern has gotten stronger over time. In <a class="act" href="#duo-clock" data-year="2024" data-hour="22">2024</a>, 75% of items fell in that night window. In <a class="act" href="#duo-clock" data-year="2026" data-hour="23">2026</a> it's 88%. During the sprint I studied throughout the evening. Now it's mostly a last-minute lesson.

## What I paid for

<figure class="fig wide duo" id="duo-receipts" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 350px">
<figcaption>Super plans (top), monthly XP boosts, day-long and week passes, and one-off streak or wager items from 2024 through 2026.</figcaption>
</figure>

The billing history follows the same arc. A monthly Super plan the night I came back, a three-day trial, then a <a class="act" href="#duo-receipts" data-month="2024-03">yearly family plan</a> from March 2024. When that lapsed there were <a class="act" href="#duo-receipts" data-month="2025-04">three months without one</a>, and then a yearly plan that runs until 2027.

There are 1,011 XP boosts in the log. Each is a 10-, 15-, or 30-minute timer that doubles XP. They peaked at <a class="act" href="#duo-receipts" data-month="2024-02">147 in February 2024</a>, which says a lot about how that ladder got climbed. The one-offs stand out more: a seven-day gem wager in December 2024, and then a <a class="act" href="#duo-receipts" data-month="2026-11">streak repair at 10:54 pm on November 8</a>, followed by a streak freeze 77 minutes later. The streak broke last night, and I paid to fix it.

## The other seven courses

<figure class="fig wide duo" id="duo-courses" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 310px">
<figcaption>All eight courses opened in the export, showing total XP alongside the date each course was last touched. Switch to Log₁₀ scale to compare the smaller courses.</figcaption>
</figure>

I've opened eight courses, including English taught from Hindi and Cantonese taught from Mandarin. Spanish has 98.2% of my course XP. On a <a class="act" href="#duo-courses" data-scale="linear" data-course="Spanish">linear scale</a> nothing else even shows up. On a <a class="act" href="#duo-courses" data-scale="log" data-course="French">log scale</a> French appears at 2,110 XP, last touched in September, and <a class="act" href="#duo-courses" data-scale="log" data-course="Korean">Korean</a> sits at zero, opened once in January 2024 and never started.

## Where the Spanish is now

<figure class="fig wide duo" id="duo-now" data-src="{{ '/assets/data/duolingo/overview.json' | relative_url }}" style="--reserve: 320px">
<figcaption>Spanish path activities since September 9 connected across the six recurring unit steps, and the 73 tracked skills plotted by times tested and accuracy against the 87% overall average.</figcaption>
</figure>

The course file only keeps the last two months of detail, but it shows the structure of the path well. I'm in section 5, and each lesson moves through the <a class="act" href="#duo-now" data-view="path">same six steps</a>: a chest, a practice, a story, a DuoRadio episode, a video call with Lily, and a unit review. In two months I did 88 of them, about fifteen of each.

The export also includes a small model of me. It tracks <a class="act" href="#duo-now" data-view="skills">73 skills</a>, mostly sentence patterns with some words and grammar rules, each with counts of how often it was tested and how often I got it right. Across 432 tests I was right 87% of the time. That's high enough for Duolingo to keep moving me forward, and low enough that I haven't learned all of it yet.

After six years, the export reads like a record of a habit more than a record of learning: one ambitious winter, and since then a lesson at 11 pm most nights to keep the streak alive. I'm fine with that.

<details class="duo-methods" markdown="1">
<summary>Data, definitions, and what was left out</summary>

The source is the Duolingo privacy export requested on November 9, 2026. A build script reads seven of its files (`leaderboards.csv`, `inventory.csv`, `languages.csv`, `profile.csv`, `user-activity.json`, `user-tree-backend.csv`, and `user-tree-backend-kc-interactions.csv`) and writes one aggregated JSON file. Contact details, account and device identifiers, IP addresses, birthdate, location, and the avatar-presentation inference are never read.

Timestamps are treated as UTC (they match the session times in `user-activity.json`) and converted to America/New_York. A league week is dated by its first recorded activity. A week's result compares its league with the next league week. *Active days* are days with at least one store item activated, so they undercount days with lessons. XP boosts are timed items lasting 60 minutes or less; day-long items last between one hour and three days; week passes come from the trial program. League XP (128,780) includes every course, so it's higher than the per-course total (127,555).

[Aggregated data (JSON)]({{ '/assets/data/duolingo/overview.json' | relative_url }})

</details>
