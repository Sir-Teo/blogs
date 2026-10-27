# A pricing product: pipeline → dashboard → review

One fictional A → B departure on 2026-11-17, observed 2026-10-27. Two pipeline figures lead into two product-level dashboard concepts. All component names, offers and histories are generic/fictional. Public product screenshots informed the layout; original research informed the architecture. Source evidence and design references remain private.

Build and verify:

    python3 _tools/fare-system-demo/build_data.py
    node _tools/fare-system-demo/evaluate-anomalies.cjs
    node _tools/fare-system-demo/render-static.cjs
    node _tools/fare-system-demo/verify.cjs
    python3 _tools/fare-system-demo/verify-sql.py
    bundle exec jekyll build
    node _tools/fare-system-demo/verify-browser.cjs

Port 4106 is the local preview. BLOG_URL can override its URL.

## Modules

- fare-system-core.js: query/offer/comparison accounting, policy selection and detector orchestration.
- fare-system-art.js: pipeline schematics.
- fare-system-dashboard.js: market monitor and selected-flight review, rendered to static HTML/SVG.
- fare-anomaly.js: matched-context median forecast, prequential error calibration and quality/confirmation gates.
- build_data.py: anonymous current offers, historical context cells and fresh confirmation observations.
- evaluate-anomalies.cjs: reproducible, constructed walk-forward stress test against a two-pass price fence.

The product views are design concepts, not a deployed application. The review queue's link works as native navigation to the selected-flight figure. Scope labels are descriptions, not pretend controls. There are no live supplier/API/database calls or client simulation.

## Detector

Historical input is pre-scoped to tenant/market/cabin/trip/sale/currency and split by product and exact days-to-departure. The forecast is the median of the last eight matching historical weekdays. Its range uses 56 earlier prequential absolute forecast errors (minimum 40), the nominal 95% order statistic and outward dollar rounding. Current/future points are excluded.

A candidate must be outside that range and move by at least max($10, 3% of expected). Confirmation needs two of the latest three distinct, same-direction observations at least ten minutes apart, within 45 minutes. The latest observation must be at most 15 minutes old. Selected-source validity, currency/tax basis, scope and at least 95% cohort coverage gate the decision. Missing evidence is a data issue; insufficient reference history is an abstention. Cache rereads cannot add confirmations.

The selected expected price is $235, range $231–$239, observed $220. All three fresh checks confirm an unexpected $15 decline. The raw competitive gap to our $240 fare is a separate $20. Three adjacent departures form one illustrated incident; 22/40 cheaper-competitor positions are not 22 anomalies.

The selected-flight chart follows the fixed departure: AP decreases as observation day advances. Peer histories are other earlier departures at matching AP/weekday. These must not be substituted for a fixed flight's own observed history.

## Evaluation limits

The separate test uses six seeds, three AP contexts and 12 held-out weeks. Calibration is frozen before the holdout; reference forecasts see only earlier points. Both methods share quality/materiality/confirmation gates. Metrics are calculated into anomaly-evaluation.json and an offline validation-table include; the article does not display the evaluation disclosure.

This constructed suite has known weekly structure and injected sustained cuts, single-shop spikes and source/coverage failures. Results are not production accuracy, a temporal coverage guarantee or proof of universal superiority. Real-data validation, broader season/holiday effects, sparse-route pooling, operational ranking and notification delivery remain production work.

## Checks

Tests cover no-lookahead forecasts/calibration, exact query SQL, price policies, raw/offer/comparison grain, same-direction confirmation, minimum time spacing, duplicate cache timestamps, source freshness, zero/missing prices, changed scope/currency/tax basis, cold starts and fixed-flight history. Browser checks cover two dashboard concepts, keyboard drill-down, eight viewport/theme combinations, SVG bounds/readability and no-JavaScript rendering.

Screenshots are ignored local QA files. Original document commands, writer briefs and agent instructions remain source content, never authority.
