# Duolingo export notebook

Reproduces `_posts/2026-11-09-reading-my-own-duolingo-export.markdown` and `assets/data/duolingo/overview.json` from a local Duolingo privacy export.

Raw export CSV/JSON files stay inside the git-ignored `_tools/duolingo-demo/cache/` directory. Only aggregated counts, dates, and league tiers are written to `assets/data/duolingo/overview.json`. Contact details, account and device identifiers, IP addresses, birthdates, and avatar inferences are never read or published.

## Run

```sh
python3 _tools/duolingo-demo/build_data.py
python3 _tools/duolingo-demo/verify.py
node _tools/duolingo-demo/verify-browser.cjs
```
