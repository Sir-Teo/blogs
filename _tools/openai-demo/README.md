# OpenAI export notebook

Reproduces `_posts/2026-11-15-reading-my-own-openai-export.markdown` and `assets/data/openai/overview.json` from a local OpenAI privacy export.

Raw export zips, CSVs, and JSON shards stay inside the git-ignored `_tools/openai-demo/cache/` directory. Only aggregated counts, dates, durations, model slugs, and topic totals are written to `assets/data/openai/overview.json`. Email addresses, physical addresses, phone numbers, IP addresses, birthdates, account/customer identifiers, and raw message text are never published.

## Run

```sh
python3 _tools/openai-demo/build_data.py
python3 _tools/openai-demo/verify.py
node _tools/openai-demo/verify-browser.cjs
```
