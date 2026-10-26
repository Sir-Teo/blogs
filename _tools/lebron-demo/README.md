# LeBron career EDA

Reproduces `2026-10-25-making-the-goat-case-for-lebron-james.markdown` and the static datasets in `assets/data/lebron/`.

The snapshot covers **2003–04 through 2025–26**, excluding the in-progress 2026–27 season. Raw source archives remain in the ignored `cache/` directory. The published files include the complete LeBron game log, located shot records, historical player-season table, small per-season shot arrays, and an audit. Nothing is fetched from an NBA API by the page.

## Run

```sh
python3 -m venv _tools/lebron-demo/.venv
_tools/lebron-demo/.venv/bin/pip install -r _tools/lebron-demo/requirements.txt
python3 _tools/lebron-demo/download.py
_tools/lebron-demo/.venv/bin/python _tools/lebron-demo/build_data.py
python3 _tools/lebron-demo/verify.py
node _tools/lebron-demo/verify-visuals.cjs
bundle exec jekyll build
```

`download.py` checks every cached or downloaded file against `sources.json`. The shot archive and historical tables are pinned to Git commits. Sportsdataverse release assets are mutable upstream: their SHA-256 hashes lock the exact local snapshot. If an upstream asset changes, the downloader fails instead of quietly revising the analysis. A future refresh must be reviewed explicitly and regenerate both the findings and article.

## Grain and sources

- NBA box scores: one player / game; NBA ID 2544 for LeBron. Keep game IDs beginning `002` (regular season) or `004` (playoffs). Include recorded zero-minute appearances when the source supplies a minutes field; some contain free throws. DNP rows have no minutes field. NBA Cup final, play-ins, exhibitions, and DNP rows do not enter the career totals.
- Shot detail: one game / event. Starting-year filenames are shifted to the ending-year convention of the box files. The field-goal records do not contain free throws. NBA coordinates are tenths of a foot relative to the basket; the figure shows a 50 × 47 ft half court. Out-of-viewport attempts remain in exports and the inspector.
- ESPN logs: audit only, joined through date, home team and away team to NBA game IDs. Team-code aliases are explicit. ESPN ID 1966 identifies LeBron. Two overlapping game records differ from NBA by one assist or steal; one game is absent. NBA is used consistently as primary.
- Historical totals: NBA and BAA, not ABA. The incomplete 2024–25 historical rows are discarded. Keep `TOT` instead of individual traded-player stints. Preserve source player IDs so namesakes are not combined. Known modern name spellings are explicitly mapped; ambiguous identities fail. NBA game totals replace the two latest completed seasons. Blank historical season fields remain missing. Career sums use recorded totals; rebounds before 1950–51 are unavailable, and the scatter and inspector disclose that limitation (Dolph Schayes in the displayed cohort).
- `Advanced.csv` was downloaded during exploration but is not used to construct the figures or GOAT argument.

`player-seasons.csv` exposes a source-qualified ID: `historical:<id>` for the historical table, and `nba:<id>` for new players absent from that table. These are not all NBA IDs. Recent players are linked to unique normalized historical names; when namesakes exist, a unique 2023–24 overlap resolves the identity. Explicit aliases cover source spelling/suffix differences. This is sufficient for the published named comparisons; refreshing the roster requires reviewing ambiguous names.

## Figure calculations

The article uses **five figures**, with one shared season selection and two consolidated evolution views.

1. **Opening career paths and highest-scoring seasons:** The opening defaults to the actual top ten by career points, with all 94 available historical leaders shown as faint full-career context. `topCareerScorers` defines the cohort; the compact ranked key doubles as a selectable legend and reports totals at the selected career stage. A compact heading shows LeBron’s rank and gap to the adjacent scorer. The largest selected point total is never used as an overall impact score. The shared season controls chronological cumulative totals and peer markers. Aggregate PPG, games, played seasons, and the inspected player’s gap to LeBron appear in a single contextual line. Peer markers compare the same number of played seasons, clamped at retirement; paths retain faint full-career references. An optional best-season comparison keeps the same ten-player cohort, sorts each player’s seasons by point totals, sums the largest N, and discloses nonconsecutive selected years. It measures scoring volume, not overall peak impact.
2. **Shot evolution, milestones, and detailed explorer:** All 23 regular seasons appear as 100% stacked location columns above an aligned efficiency line. Category labels and selected shares share one legend; only the selected efficiency point is marked. Exact TS rates, NBA TS and shot counts appear once beside the court. Optional phase, raw counts, individual events and cell inspection are in one tools disclosure; loading and empty states remain visible on the court. `shotMix` groups restricted area, other paint, mid-range, and three-point area plus backcourt; shares use located attempts. Two unlocated misses stay excluded from location shares and included in box-score efficiency. Location classifications can differ slightly from box-score three-point classifications. Efficiency is complete-season TS minus the contemporaneous league TS in percentage points, with a fixed −5 to +15 pp scale. Era labels identify both Cleveland stretches, Miami, and Los Angeles. One visible court replaces the milestone cards and collapsible explorer. Its native season range covers all 23 years, with 23 ticks and three milestone shortcuts at 2003–04, 2012–13, and 2025–26. Frequency mode uses a common 20-unit hex lattice, constant cell size, and fixed share-color thresholds. Attempts mode retains the 13-unit lattice and fixed logarithmic area scale; Every shot retains individual makes and misses. Zone FG% keeps league benchmarks excluding LeBron, and out-of-viewport attempts remain inspectable. Both the court range and milestone shortcuts update the shared season. TS = PTS / [2 × (FGA + 0.44 × FTA)]; league TS comes from league player totals, not a mean of player rates.
3. **Career roles and longevity:** Four aligned trends combine scoring, assists, rebounds per appearance, and appearances. Selected LeBron/peer values are color-matched to their lines, dates appear only under the bottom row, and only selected or short-sample seasons have dots. The shared timeline supplies season selection, so the redundant local year picker and era buttons are removed. Peers align by age on February 1, mapped to LeBron's season axis; they do not align by calendar year. Age 35+ narrows the horizontal range while retaining fixed vertical scales. Missing seasons break paths; fewer than 40 appearances use hollow points. Games are appearances, not schedule share. The alternate scoring-and-creation trajectory uses points/game on x and assists/game on y. A five-season trail ending at the selected year limits crossing lines; the last segment has a direction arrow when there is enough room. Full-career context and four milestone labels remain available. Every point and every metric comes from the same regular-season records; rates are unadjusted for pace.
4. **Paired full-career scatterplots:** Passing and rebounding appear together with the same 0–46,000 points axis and different vertical scales. Selection and hover highlight a player in both panels. The 94-player cohort is the union of the top 40 players in points, assists, and rebounds, using source-qualified IDs. NBA/BAA totals exclude ABA. Pre-1950–51 rebounds remain unavailable; the inspector discloses the recorded-total limitation. These are full-career reference comparisons, independent of the selected season.
5. **Guided playoffs:** Games stay in date order. Three chapter buttons highlight Games 1–4, 5–6, and Game 7 on fixed axes. Each chapter has one short finding instead of a large duplicate statistic and previous/next controls. The RS baseline value lives in its legend; full-series category comparisons use five compact paired-bar rows with exact values and named rivals. Series progress counts results after each game; elimination shading starts when the team already has three losses, resetting with each opponent. The dashed baseline is that year's regular-season rate. Five paired comparisons use full-series totals against the best other player from either team, each pair on its own zero-based scale. The 2018 and 2011 presets, other years, rounds, and metrics remain available.

## Audited findings and limits

- 1,622 regular-season games: 43,440 points / 12,016 assists / 12,095 rebounds.
- 302 playoff games: 8,521 points / 2,168 assists / 2,695 rebounds.
- All 21 overlapping complete historical regular seasons match on games and all selected counting statistics.
- 37,669 box-score FGA versus 37,667 mapped attempts. Missing locations: one miss on 2015-11-14 and one on 2016-12-29. Do not invent either location or exclude the attempts from TS denominators.
- 2016 Finals: LeBron leads both teams in all five of PTS / REB / AST / STL / BLK.
- 22 of 23 completed regular seasons above the contemporaneous league TS baseline.

This is exploratory, descriptive analysis. It is not a causal impact model, an era-adjusted player ranking, or a complete account of defense. Career totals, peak scoring, rings, and individual impact answer different questions. The article explicitly argues for a definition of greatness that values the complete career.

## Visualization references

- [Goldsberry](https://grantland.com/the-triangle/courtvision-the-year-in-scoring/?print=1): separate shooting volume from efficiency.
- [Washington Post](https://www.washingtonpost.com/sports/interactive/2023/lebron-james-nba-scoring-record/): expose career accumulation as paths.
- [D3 hexbin documentation](https://observablehq.com/@d3/hexbin): spatial aggregation reference. Local geometry is dependency-free and conserves every shot.

The figures are original implementations over this project's data. References stay in this internal notebook, outside the blog. `verify-visuals.cjs` runs the same helpers used by the browser and checks every shot, zone, make, and career endpoint.

## Shared season navigation

A single `createSeasonState` controller links the opening curves, four career measures, age-aligned peer comparison, role trajectory, shot-mix and efficiency timeline, and shot explorer. It starts at 2025–26 and supports every completed season from 2003–04. The compact native range sticks to the top of the article while reading, has 44px previous/next controls, and supports keyboard stepping, Home, and End. Local court, plot, and age controls update the same selection; equal selections do not emit another update. The early seasons automatically expand the aging view to include them. The opening always retains chronological paths; the optional highest-scoring-seasons analysis has its own nonconsecutive window.

The full-career scatterplots and Finals story are reference views. The unified court remains visible and follows the selection. Per-season locations are cached; neighboring seasons and milestone seasons are warmed after a successful load. Response tokens prevent an earlier request from replacing the latest season. Shot metadata updates immediately from the overview while locations load.

## Browser checks

The figure code uses native SVG/canvas and the blog's existing theme tokens. Inspect both themes at desktop, 390px, and 320px widths. Scrub all 23 shared seasons and check matching years across the linked figures, cumulative point markers, and ages. Verify the ten actual scoring leaders and all 94 background paths are visible by default. Test previous/next endpoints, synchronization from each local control, rapid changes on the court time axis, and unchanged reference views. Check the shot-mix and efficiency alignment, drag or step through the court axis, select each of the three milestone shortcuts, switch Frequency / Attempts / Every shot, and walk the 2016 guide forward and backward; verify keyboard inspection and the 2018/2011 presets. Verify that the paired scatterplots select the same player, reset to LeBron, and preserve all 94 players in both panels. Check the Age 35+ checkbox in the combined career trends and a retired peer with no season at the selected age. Inspect the role trajectory at early, Miami, and Lakers seasons; test keyboard inspection and five-season trail endpoints. Exercise all five figures, the prose links, the scoring-window slider, career/role/shooting/game arrow-key inspection, clickable shot zones, no-playoff/no-Finals states, the shot attempt slider, and retry states. Finals comparison bars pair LeBron with the highest other player's total in each category; each pair shares its own zero-based scale. `verify.py` checks the source-derived relationships and fixed independent career/series totals; it does not replace rendered inspection.
