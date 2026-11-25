# McDonald's export post toolchain

Zero-dependency stdlib Python scripts that build and verify the interactive figures for [`_posts/2026-11-25-reading-my-own-mcdonalds-export.markdown`](../../_posts/2026-11-25-reading-my-own-mcdonalds-export.markdown).

- `build_data.py` — parses the raw McDonald's Access & Portability PDF extraction and Mixpanel CSVs (kept outside git), enforces the privacy firewall (strips PII and folds Greater Boston suburbs into `Greater Boston, MA`), and writes `assets/data/mcdonalds/overview.json`.
- `verify.py` — audits `overview.json` and the post markdown for privacy leaks, exact arithmetic invariants across all six figures, prose style rules, and action link wiring.
- `verify_chrome.py` — launches headless Chrome over raw CDP, exercises all six interactive figures, toggles, session replays, and inline action links at 1440px, 390px, and 320px in light and dark themes, checks zero SVG text overlap/clipping and non-blank 3D canvas rendering, and renders `assets/social/reading-my-own-mcdonalds-export.png`.
