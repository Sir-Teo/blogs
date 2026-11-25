---
layout: post
title: "Reading my own McDonald’s export"
series: exports
description: >-
  An exploratory tour through 71 McDonald’s meals across 36 restaurants, 15
  states, and 23,812 miles: Wednesday 7 pm dinners at home versus Sunday
  road-trip breakfasts, my exact serving tray, a loyalty coupon penalty, and a
  model 100% sure I will buy cake.
image: /assets/social/reading-my-own-mcdonalds-export.png
date: 2026-11-25 12:00:00 -0500
excerpt: >-
  McDonald’s sent me a 259-page privacy report and 674 Mixpanel events covering
  four years and 71 meals across 15 states: three cities I lived in, two
  different eating clocks, my exact serving tray, and the pricing engine behind
  the kiosk.
styles:
  - /assets/css/mcdonalds.css
scripts:
  - /assets/js/mcdonalds.js
---

McDonald’s sent me a 259-page Access & Portability PDF and a 674-row Mixpanel log covering four years of my account. Read as a personal diary, the archive reconstructs **71 meals across 36 restaurants in 15 states** — **$657.66** across 70 point-of-sale orders ($667.85 including one Virginia highway stop logged only in Loyalty), **23,812 miles** between consecutive kiosks, and a sharp split between my weekday routine at home and my habits on the road.

Every figure runs in the browser on one aggregated file built from the export. My email, birthday, account IDs, device tokens, street addresses, and Greater Boston suburbs never leave my machine.

## Four years, three cities, seventy-one meals

<figure class="fig wide mcd" id="mcd-journey" data-mcd="journey" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 350px">
  <div class="mcd-body"></div>
  <figcaption>Fifty-two months of outbound pushes, home orders (cobalt), and road stops (amber) above monthly spend and the cumulative $667.85 curve. <span class="only-hover">Drag across any span of months</span><span class="only-touch">Tap or drag across months</span> to sum its visits, spend, deal rate, and points.</figcaption>
</figure>

The first two years are empty. I opened the account on August 27, 2022 and bought nothing for <a class="act" href="#mcd-journey" data-do="era-dormant">663 dormant days</a> while McDonald’s fired **83 marketing pushes** — 25 `FreeFriesFriday` blasts, Packers and Fairmont State promos, two holdouts, and tags like `SAUCEBOSS_GENZ_HYPEBEAST`. After my first Manhattan kiosk purchase on June 20, 2024 ($9.99), I turned pushes off <a class="act" href="#mcd-journey" data-do="replay-17s">17 seconds later</a>. Marketing pushes fell to zero forever, while 64 `OAS` updates, five in-app splashes, four order-ready pings, and one leaked engineer test (`Random_bucket_number_test_AK`) kept logging underneath.

Once purchases start, the timeline traces three cities where I lived. <a class="act" href="#mcd-journey" data-do="era-nyc">NYC & Jersey City</a> (Jun–Dec 2024, 16 orders) was my $5 Meal Deal era, averaging $8.06. <a class="act" href="#mcd-journey" data-do="era-philly">Philadelphia</a> (2025, 22 orders) lifted my regular dinner to $11.78, peaking at four visits in seven days that June. After a 75-day winter break ended at Chicago Global HQ, <a class="act" href="#mcd-journey" data-do="era-boston">Greater Boston & 2026 road trips</a> drove 33 orders — half of lifetime spend in ten months.

## Two clocks: Wednesday dinners at home, Sunday breakfasts on the highway

<figure class="fig wide mcd" id="mcd-rhythm" data-mcd="rhythm" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 365px">
  <div class="mcd-body"></div>
  <figcaption>Synchronized 24-hour local-time watch dials comparing home hubs (left, cobalt) with road stops (right, amber), paired with each side’s Mon–Sun cadence below. Hover either dial to sweep linked hands across both clocks, click any hour or weekday bar to filter, or sweep 24 hours with sound.</figcaption>
</figure>

Converting every order to its restaurant’s local time zone exposes two opposite customers inside one account. At home (45 orders across NYC/NJ, Philadelphia, and Greater Boston), McDonald’s is a weeknight dinner habit: **26 of 27 visits during the 6–7 pm peak** happen at home, led by <a class="act" href="#mcd-rhythm" data-do="clock-wed">Wednesdays</a> (15 visits, 13 at home). Home breakfasts sit at zero.

On the road (26 orders across 12 other states), the clock flips. All **4 breakfasts** (8–10 am) and **11 of 16 midday 11 am–noon stops** happen while traveling, and <a class="act" href="#mcd-rhythm" data-do="clock-sun">Sundays</a> jump to #1 overall (17 visits, 11 on the road). Zero orders land between 11 pm and 7 am on either dial. Press <a class="act" href="#mcd-rhythm" data-do="clock-sweep">Sweep 24h</a> to watch the linked hands move through the day from morning highways to evening kiosks.

## 23,812 miles across fifteen states

<figure class="fig wide mcd" id="mcd-atlas" data-mcd="atlas" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 450px">
  <div class="mcd-body"></div>
  <figcaption>Draggable 3D US road-trip atlas of all 36 restaurants (Greater Boston’s seven stores folded into one metro hub). Drag to orbit, click any city prism to isolate its routes, scrub the 23,812-mile odometer, or overlay Mixpanel’s carrier-IP errors.</figcaption>
</figure>

Connecting all 71 stops chronologically traces **23,812 great-circle miles** across 41 inter-city hops — nearly one lap around Earth’s equator. Outside my three home hubs, the stops map weekend drives and flights: <a class="act" href="#mcd-atlas" data-do="trip-maine">Maine & the White Mountains</a> (Calais on the Canadian border, plus a July 12 double-header in Gorham at 8:59 am and North Conway at 3:15 pm), Virginia Beach, Painesville and Utica, Space Center Houston, Douglas in Wyoming, and Hinckley in Minnesota.

Two stops stand out. On February 15, 2026, I broke my 75-day dry spell at <a class="act" href="#mcd-atlas" data-do="trip-chicago">Chicago Global HQ</a> ($8.99), ordering Spain’s Chocolate Hazelnut McPops. Eight months later, four visits in 72 hours to <a class="act" href="#mcd-atlas" data-do="trip-lax">Store #7889 near LAX</a> became my sole corporate-owned (`MCOPCO`) restaurant — logging 2,688 separate points to the digit. Press <a class="act" href="#mcd-atlas" data-do="play-trip">Play 23,812 mi</a> to watch the odometer climb, or toggle <a class="act" href="#mcd-atlas" data-do="ip-ghosts">Mixpanel’s IP ghosts</a>: across 33 matched visits, cellular IPs guessed the wrong state 13 times (39.4%), firing an arc **2,579 miles** from Boston to San Diego.

## What is actually on my tray

<figure class="fig wide mcd" id="mcd-menu" data-mcd="menu" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 380px">
  <div class="mcd-body"></div>
  <figcaption>Interactive serving tray built from all 18 Level-3 product categories, scaled by order count with edge-to-edge pairing locks. Hover or click any item on the tray, or switch between 365-day, 90-day, and 30-day windows.</figcaption>
</figure>

Over the trailing 365 days, my tray averages 3.3 items (max 7) and stays consistent. <a class="act" href="#mcd-menu" data-do="tray-nuggets">Four staples dominate</a>: **29 Soft Drinks**, **28 French Fries**, **27 Chicken McNuggets**, and **27 Dips / Sauces** — an unbroken 27-for-27 nugget-to-sauce lock. Behind them sits <a class="act" href="#mcd-menu" data-do="tray-value">the $5 Value Meal pair</a>: **16 McDoubles** matched 16-for-16 with **16 Cross Menu Bundles**, showing up as seven identical `$5.00` receipts.

The tray’s corners hold the exceptions: 8 McFlurries (led by `Mini Derpy McFlurry`, a Netflix *K-Pop Demon Hunters* tie-in ranked #1 by McDonald’s relevancy model), <a class="act" href="#mcd-menu" data-do="tray-breakfast">road-trip breakfasts</a> (3 McMuffins paired 3-for-3 with 3 Hash Browns), <a class="act" href="#mcd-menu" data-do="tray-hq">Spanish McPops</a> at Chicago HQ (plus three Monopoly prizes including Peacock Premium), and 17 purchases of <a class="act" href="#mcd-menu" data-do="tray-ops">Restaurant Operations</a> — municipal bag fees and Philadelphia soda taxes disguised as a menu item. On 63 tracked visits ($622.75 paid sales; median ticket **$9.99**, max **$18.79** in Manchester, CT), McDonald’s booked **$455.33** of gross profit margin — **73.1%**.

## Playing the coupon game — and getting taxed for winning

<figure class="fig wide mcd" id="mcd-deals" data-mcd="deals" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 390px">
  <div class="mcd-body"></div>
  <figcaption>Thirty-month segmented coupon staircase (50% → 40% on McFlurry & 10pc Nuggets; 40% → 30% on 20pc & 6pc) above monthly visits. Hover or drag across any month to inspect the tier and campaign slug.</figcaption>
</figure>

I hunt deals at home (**80.0%**, 36 of 45 POS orders) and pay full price far more often on the highway (**52.0%**, 13 of 25), averaging **70.0%** overall (49 of 70) — led by `$1.99 any size Fries`.

Every monthly segmented offer (`SO_*`) prints my tier inside its slug. From <a class="act" href="#mcd-deals" data-do="bau-low">April through August 2025</a>, `LOW` gave me **50% off** McFlurries and 10-piece Nuggets and **40% off** 6-piece offers. Once my Boston routine made me predictable in <a class="act" href="#mcd-deals" data-do="bau-hm">2026</a>, `H/M` cut **10 percentage points** off every staple (40% and 30%), restoring the extra 10% only during two zero-visit months (November 2025 and March 2026). Press <a class="act" href="#mcd-deals" data-do="sweep-bau">Sweep 30 months</a> to watch the downgrade live.

On **May 4, 2026**, MyMcDonald’s Rewards also raised redemption tiers nationwide: Large Fries jumped from 4,500 to **5,000 points** (+11.1%) under identical `Reward ID 1137`, Medium Fries rose from 3,000 to **3,500**, and 10-piece Nuggets reached **7,000**. My ledger balances to the single point: 64,013 franchise points plus 2,688 corporate LAX points (66,701 total), minus 50,000 redeemed across 12 rewards and 538 expired, leaving **16,163 points**.

## 174 seconds at the kiosk, and four glitches in the app

<figure class="fig wide mcd" id="mcd-kiosk" data-mcd="kiosk" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 310px">
  <div class="mcd-body"></div>
  <figcaption>Clickable wireframe iPhone emulator synced to the dual-lane iPhone and mParticle server oscilloscope across four real Mixpanel sessions. Click the phone screen, scrub any event, or press Play.</figcaption>
</figure>

Inside `Customer Insights`, **59 of 63 visits (93.7%)** happened at a kiosk, **zero used cash**, and **1** used Mobile Order & Pay. Across 33 Mixpanel kiosk visits, median Scan-to-Pay time is **174 seconds** (79s near LAX, 353s in North Conway), with `v26.72` renaming the schema overnight on October 3, 2026.

Four phone replays show why I stick to kiosks. On November 10, <a class="act" href="#mcd-kiosk" data-do="sess-googleplus">signing in threw `Error 41484`</a>: *“The user is already registered using Googleplus, please use Googleplus to login”* — seven and a half years after Google+ shut down. On April 8, a *HUNTR/X* splash led to <a class="act" href="#mcd-kiosk" data-do="sess-mobile">my sole mobile order</a>: two `CART_INVALID_ITEMS` errors, **1,580,000 calories**, and a signed 32-bit `Order Number` overflow from 2528362374 to **−1766604922**. Twice afterward — <a class="act" href="#mcd-kiosk" data-do="sess-bailout">August 30 in Boston</a> and <a class="act" href="#mcd-kiosk" data-do="sess-lax">October 13 near LAX</a> — I purged a mobile bag and walked to the kiosk.

## 100% sure I’ll buy cake — and every penny accounted for

<figure class="fig wide mcd" id="mcd-mirror" data-mcd="mirror" data-src="{{ '/assets/data/mcdonalds/overview.json' | relative_url }}" style="--reserve: 430px">
  <div class="mcd-body"></div>
  <figcaption>Draggable 3D Kolmogorov probability manifold: X = P(≤90d), Z = P(≤30d), and cobalt tower height = actual 365-day orders. Five impossible categories breach the vertical crimson P(30d) = P(90d) wall.</figcaption>
</figure>

McDonald’s scores me across seven ML models: Lifetime Value labels me **`Can’t Lose`** (`Downgraded`, $76.91 six-week forecast). Yet because its 30-day and 90-day purchase models train uncoupled, **5 of 17 categories violate P(≤ 30d) ≤ P(≤ 90d)**. `Cakes` leads at **100%** (30d) vs. **99%** (90d) on zero cake orders — probably triggered by that Spanish McPop at Chicago HQ. `Coffee` predicts 52% vs. 32% on one coffee all year, <a class="act" href="#mcd-mirror" data-do="ml-churn">Churn predicts 6% vs. 3%</a>, and <a class="act" href="#mcd-mirror" data-do="ml-topdown">looking straight down in 2D</a> exposes all five violations above the diagonal. Even the occasion model scores my #1 habit (`Dinner on the go`, 9 visits) at 51% while `Casual breakfast` (3 visits) hits 94%.

Meanwhile, the accounting warehouse tracks every nickel: subtracting base points from `100 × ex-tax spend` across 69 matched orders yields zero on 48 receipts, and all **21 remaining gaps** map to non-earning municipal fees — **15 of 15 Philadelphia orders** off by 39, 60, or 78 points (1.5¢/oz beverage tax), **3 LAX orders** off by 10 points (California’s 10¢ bag fee), and **3 Boston orders** off by 5 points (Boston’s 5¢ bag fee), leaving zero unexplained pennies. At the same time, seven internal tables freeze on seven different dates — from a four-year-old `Test & Learn` snapshot (October 25, 2022) to Mixpanel live on November 24, 2026.

Four years of McDonald’s data reads less like omniscience and more like a map of my own routines: Wednesday nuggets and fries at home, Sunday breakfasts on the interstate, 70% coupon discipline, and a system sharp enough to price a five-cent bag while swearing I will buy cake.

<details class="mcd-methods" markdown="1">
<summary>Sources, privacy firewall, and methods</summary>

This post combines two November 2026 exports: McDonald’s 259-page Access & Portability PDF (1,218 sections, August 27, 2022–November 22, 2026) and its Mixpanel CSV export (674 events across 253 columns, November 24, 2025–November 24, 2026: 580 iPhone client events and 94 mParticle server events).

Raw exports stay out of git. Before writing [`assets/data/mcdonalds/overview.json`]({{ '/assets/data/mcdonalds/overview.json' | relative_url }}), `_tools/mcdonalds-demo/build_data.py` strips all personal identifiers (name, email, DOB, customer/account/DCS IDs, device IDs, push tokens, reference IDs, and street addresses) and folds all seven Greater Boston restaurants and suburban IP readings into `Greater Boston, MA`. Every order timestamp is converted from UTC to its restaurant’s local IANA time zone (`America/New_York`, `America/Chicago`, `America/Denver`, or `America/Los_Angeles`). Every claim is checked by `_tools/mcdonalds-demo/verify.py`, and every figure is audited in headless Chrome for zero SVG text clipping or overlap across desktop and mobile viewports.

</details>
