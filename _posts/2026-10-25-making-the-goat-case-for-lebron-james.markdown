---
layout: post
title: "Making the GOAT case for LeBron James"
description: >-
  Twenty-three seasons of box scores and 37,667 mapped shots from a lifelong
  LeBron fan—tracing how a teenage phenom rebuilt his jumper, turned himself
  into a point guard at thirty-five, and outlasted everyone who came before him.
date: 2026-10-25 12:00:00 -0400
excerpt: >-
  From a lifelong LeBron fan: 1,924 box scores and 37,667 mapped shots across
  23 seasons—tracing how he rebuilt his jumper in Miami, ran point in Los
  Angeles, and kept putting up 20-and-7 past forty.
styles:
  - /assets/css/lebron.css
scripts:
  - /assets/js/lebron-core.js
  - /assets/js/lebron.js
---

I have been a LeBron James fan for life—or at least since elementary school, when I was stuck following <a class="act" href="#lbj-playoffs" data-year="2013" data-scope="finals" data-game="6">Game 6 of the 2013 Finals</a> on a text-only play-by-play stream. I didn't even have video, just lines of text refreshing on the screen as Miami fell behind late in the fourth quarter, LeBron piled up a 32-point, 10-rebound, 11-assist triple-double to keep them breathing, Chris Bosh tracked down the rebound, and Ray Allen backed into the right corner to force overtime. I became a fan for good that day, went back through old footage and box scores to learn the first Cleveland stint and the 2011 Dallas collapse I was too young to watch live, and have been checking his box scores every morning for the thirteen years since. After half a lifetime of having the same GOAT argument in classrooms and group chats, I wanted to put the whole career in one place where you can scrub through it yourself.

Every figure below runs directly in the browser on 1,924 regular-season and playoff box scores and 37,667 mapped field-goal attempts through 2025–26, compiled offline from public NBA archives with no chart library or live API behind it. The season bar just below steps all of the regular-season views together from his rookie year in 2003–04 to year twenty-three.

<div class="lbj-timeline" id="lbj-timeline" role="group" aria-label="Shared season controls" hidden></div>
<p class="lbj-timeline-help lbj-visually-hidden" id="lbj-timeline-help">Scrub through the seasons to link the scoring curves, shot evolution, career roles, and age comparisons.</p>

## Passing Kareem, and where Jordan still wins

<figure class="fig wide lbj lbj-opening" id="lbj-peak" data-src="{{ '/assets/data/lebron/overview.json' | relative_url }}">
<figcaption>Cumulative regular-season points for the ten all-time scoring leaders against 94 historical leaders in faint grey, stopping at retirement; switch to Peak seasons to stack each player's highest-scoring years segmented by season.</figcaption>
</figure>

When LeBron hit that fading foul-line jumper against Oklahoma City in February 2023—finishing <a class="act" href="#lbj-peak" data-year="2023" data-player="Kareem Abdul-Jabbar">his twentieth season</a> just past Kareem Abdul-Jabbar's 38,387 points, a mark that had stood since 1984—plenty of skeptics treated the record like an attendance trophy. Then he kept playing for three more years and stretched the margin out to <a class="act" href="#lbj-peak" data-year="2026" data-player="Kareem Abdul-Jabbar">5,053 points</a> (43,440 in all).

Raw totals alone, though, have never won an argument against someone who grew up on nineties Bulls basketball. Switch to Peak seasons on the chart and <a class="act" href="#lbj-peak-best" data-window="7" data-player="Michael Jordan">stack everyone's seven highest-scoring years</a>: Michael Jordan clears LeBron by more than three thousand points (18,907 to 15,848), and <a class="act" href="#lbj-peak-best" data-window="7" data-player="Wilt Chamberlain">Wilt Chamberlain</a> clears everybody at 21,486. If your definition of greatness is the sharpest seven-year scoring blade ever swung, Jordan has the cleaner cut. The case for LeBron lives in what happened on either side of his first peak: how many times he tore his game down and rebuilt it while the league changed around him.

## Rebuilding the jumper in public

<figure class="fig wide lbj" id="lbj-shots" data-src="{{ '/assets/data/lebron/overview.json' | relative_url }}">
<figcaption>Regular-season shot mix across 37,667 mapped attempts, true shooting relative to that season's NBA baseline, and a half-court map sizing hexes by shot volume and coloring them by field-goal rate against the rest of the league in that zone.</figcaption>
</figure>

If you watched <a class="act" href="#lbj-shots" data-year="2004">rookie LeBron in 2003–04</a>, teams guarded him by backing off to the foul line and daring him to shoot over the gap. More than a third of his attempts (36.9%) were mid-range twos, he finished 57.5% in the restricted area before he learned how to use his shoulders in traffic, and his true shooting (48.8%) came in 2.8 percentage points worse than the league—the only season in all twenty-three he ever spent below the NBA line.

Running into San Antonio in 2007 and Dallas in 2011 forced him to fix every flaw in full view of everyone watching. By <a class="act" href="#lbj-shots" data-year="2013">2012–13 in Miami</a>, working out of the low post and hunting corner threes, he had turned himself into an efficiency outlier: 76.0% at the rim, 40.6% from deep, and true shooting 10.6 percentage points clear of the league (+10.8 the following year).

Then NBA spacing blew wide open and he adapted a third time in Los Angeles. By <a class="act" href="#lbj-shots" data-year="2024">2023–24</a> he had pared mid-range jumpers down to 13.0% of his diet while hitting a career-high 41.0% from three at thirty-nine. That late shift wasn't effortless: in <a class="act" href="#lbj-shots" data-year="2026">2025–26</a>, with threes up to 26.4% of his shots and mid-range at 17.2%, his outside touch cooled back to 31.7%. Yet if you <a class="act" href="#lbj-court-time" data-year="2026" data-zone="0">isolate the restricted area in year twenty-three</a>, the wildest number on the court is still sitting right under the basket. At forty-one years old, he converted 75.6% at the rim, essentially unchanged from peak Miami.

## Handing himself the keys at thirty-five

<div id="lbj-age" class="lbj-anchor" aria-hidden="true"></div>
<figure class="fig wide lbj" id="lbj-career" data-src="{{ '/assets/data/lebron/overview.json' | relative_url }}">
<figcaption>Four regular-season trends aligned by age on February 1 against historical peers (dates shown are LeBron's; hollow dots mark seasons under 40 games), alongside a scoring-and-creation view tracing a five-season trail.</figcaption>
</figure>

Box-score debates still talk about LeBron like a wing scorer who happens to pass, mostly because he averaged <a class="act" href="#lbj-career" data-year="2006" data-view="role">31.4 points a night at twenty-one</a>. Watching him every week felt like the exact opposite: he came into the league wired like a point guard in Karl Malone's frame, averaging 5.9 assists as a teenager and catching grief on talk radio whenever he trusted a skip pass to an open shooter in the final seconds over a forced jumper. Once Anthony Davis arrived in <a class="act" href="#lbj-career" data-year="2020" data-view="role">2019–20</a>, LeBron took the ball full-time and led the NBA with 10.2 assists per game at thirty-five on the way to a fourth ring. Miami got his deadliest scoring efficiency; Los Angeles got his purest playmaking. Almost nobody gets two distinct primes a decade apart.

Just as strange is how stubbornly the floor held underneath him. He averaged at least 20 points in all 23 seasons and beat league-average true shooting in 22 of them, even as the NBA's own efficiency climbed from 51.6% in his rookie year to 58.1% in 2025–26. A full quarter of his career points (10,897 across 424 games) came after he turned thirty-five. Line him up by age against the longest-lasting legends in the archive: at <a class="act" href="#lbj-career" data-age="39" data-player="Michael Jordan">thirty-nine</a>, Jordan's final Wizards season stood at 20.0 points and 3.8 assists while LeBron put up 25.7 and 8.3; at <a class="act" href="#lbj-career" data-age="40" data-player="Kareem Abdul-Jabbar">forty</a>, LeBron gave the Lakers 24.4 points and 8.2 assists across 70 games where Kareem averaged 14.6 and 1.7; and at <a class="act" href="#lbj-career" data-age="41" data-player="Kareem Abdul-Jabbar">forty-one</a>, he was still good for 20.9 and 7.2 over 60 nights.

## Alone in the upper-right corner

<figure class="fig wide lbj" id="lbj-two-jobs" data-src="{{ '/assets/data/lebron/overview.json' | relative_url }}">
<figcaption>Regular-season NBA/BAA career totals through 2025–26 for 94 all-time leaders—the union of the top 40 in points, assists, and rebounds. Shaded corners mark 40,000 points paired with 10,000 assists or rebounds. Pre-1950–51 rebounds were not recorded.</figcaption>
</figure>

Put twenty-three years of doing three jobs at once onto a career scatter plot and that upper-right corner turns into a party of one. Out of the 94 players who rank top forty all-time in points, assists, or rebounds, nobody else sits inside the shaded 40,000-and-10,000 box on *either* chart—and LeBron sits comfortably inside both at 43,440 points, 12,016 assists, and 12,095 rebounds.

On the left panel, only <a class="act" href="#lbj-two-jobs" data-player="John Stockton">John Stockton</a>, <a class="act" href="#lbj-two-jobs" data-player="Chris Paul">Chris Paul</a>, and <a class="act" href="#lbj-two-jobs" data-player="Jason Kidd">Jason Kidd</a> have ever thrown more assists, putting LeBron 1,875 dimes ahead of <a class="act" href="#lbj-two-jobs" data-player="Magic Johnson">Magic Johnson</a> while scoring nearly two-and-a-half times as many points. On the right panel, a guy who spent half his career bringing the ball up the floor has cleared career bigs on the glass while outscoring <a class="act" href="#lbj-two-jobs" data-player="Wilt Chamberlain">Wilt Chamberlain</a> by twelve thousand.

## Seven nights in June

<figure class="fig wide lbj" id="lbj-playoffs" data-src="{{ '/assets/data/lebron/overview.json' | relative_url }}">
<figcaption>Postseason game logs against that year's regular-season average (dashed line), with elimination games shaded. On Finals views, paired bars below compare full-series totals against the next highest player from either team.</figcaption>
</figure>

Still, nobody becomes a fan for life because of a career scatter plot. You fall in love with a player on nights when a season is seconds from dying and he refuses to let it end—whether that was reading the text play-by-play of his <a class="act" href="#lbj-playoffs" data-year="2013" data-scope="finals" data-game="6">32-10-11 fourth-quarter charge in Game 6 of 2013</a> and the <a class="act" href="#lbj-playoffs" data-year="2013" data-scope="finals" data-game="7">37-point Game 7</a> that followed, or watching what happened three Junes later back home in Ohio. In 2016, Cleveland fell behind a 73-win Golden State team 3–1 heading back to Oracle Arena. LeBron answered with <a class="act" href="#lbj-playoffs" data-year="2016" data-scope="finals" data-game="5">41 points, 16 rebounds, 7 assists, 3 steals, and 3 blocks in Game 5</a>, came home and hung <a class="act" href="#lbj-playoffs" data-year="2016" data-scope="finals" data-game="6">another 41 with 11 assists in Game 6</a>, and closed out <a class="act" href="#lbj-playoffs" data-year="2016" data-scope="finals" data-game="7">Game 7 on the road</a> with a 27-point triple-double and the chase-down block on Andre Iguodala that every Cavs fan can still replay with their eyes shut. When the series ended, he led every player on *both* rosters in total points (208), rebounds (79), assists (62), steals (18), and blocks (16).

If you are putting the whole career on the table, the nights without confetti belong here too. Two springs later came the <a class="act" href="#lbj-playoffs" data-year="2018" data-scope="all" data-metric="pts">2018 playoff run</a>, twenty-two games of dragging an outmatched Cleveland roster on his back at 34.0 points, 9.1 rebounds, and 9.0 assists a night, peaking in a <a class="act" href="#lbj-playoffs" data-year="2018" data-scope="finals" data-game="1">51-point Game 1</a> at Golden State that still stings to think about. And five years before 2016 sits the week no LeBron fan can talk around: the <a class="act" href="#lbj-playoffs" data-year="2011" data-scope="finals" data-game="4">2011 Finals against Dallas</a>, where he disappeared for 8 points in Game 4 and averaged 17.8 for the series.

Honestly, that scar is a big part of why I ended up rooting for him even harder. He didn't hide from 2011; he went back into a gym, built a post game and a jumper he didn't have at twenty-six, and spent the next fifteen years answering for it. You can still pick Jordan—six Finals, six rings, never once shrinking under those lights, and a seven-year scoring peak nobody has touched—and I won't tell you you're wrong. For me, greatness stretched across a whole basketball life looks like the kid who showed up at eighteen carrying impossible hype, stumbled in front of the entire world, reinvented his game three times, and was still giving you twenty-and-seven at forty-one.

<details class="lbj-methods" markdown="1">
<summary>Sources, definitions, and data downloads</summary>

The archive stops after the completed 2025–26 season (1,622 regular-season games and 302 playoff games, excluding play-in, exhibition, and NBA Cup final games that do not count toward official career totals). Career leaderboards cover NBA and BAA regular seasons; the 94-player comparison cohort is the union of the top 40 players in points, assists, and rebounds. Games played count appearances unadjusted for schedule length, and scoring rates are unadjusted for era or pace.

True shooting is `PTS / [2 × (FGA + 0.44 × FTA)]`; league baselines are computed from full-league totals in that season rather than a mean of player rates, and zone field-goal benchmarks exclude LeBron. Shot-diet shares group NBA location zones (merging rare backcourt heaves with three-pointers) across all 37,667 located attempts; two missed shots from 2015–16 and 2016–17 carry no coordinates in the upstream NBA log and stay out of location shares while remaining in box-score true shooting. On the half-court map, Shot profile scales hex area logarithmically with attempt count and colors each cell by empirical-Bayes field-goal delta against the rest-of-NBA rate in that zone, Share uses equal hexagons on a fixed season-share scale, and Every shot plots individual makes and misses.

[Source manifest]({{ '/assets/data/lebron/sources.json' | relative_url }}) · [LeBron game log (CSV)]({{ '/assets/data/lebron/games.csv' | relative_url }}) · [Historical player-seasons (CSV)]({{ '/assets/data/lebron/player-seasons.csv' | relative_url }}) · [Cross-source audit]({{ '/assets/data/lebron/audit.json' | relative_url }})

</details>
